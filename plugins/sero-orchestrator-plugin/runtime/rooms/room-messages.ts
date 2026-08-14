/**
 * Durable Room messages, paged on disk (spec §17.1). Messages are persisted
 * BEFORE delivery and read forward from a per-member cursor, so a message
 * survives a restart whether or not the recipient ever woke for it.
 *
 * A page holds a fixed slice of the Room's monotonic sequence, so the page a
 * message lives in is arithmetic — no page index file to drift from the pages
 * themselves. Appending touches only the current page; the next sequence past
 * its end rolls to a new one.
 */

import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import type { AppRuntimeStateApi } from '@sero-ai/common';
import type { MessageLease, RoomMessage } from '../../shared/room-message-types';
import type { RoomPaths } from './room-paths';
import type { RoomRecord } from './room-state';

export const MESSAGE_PAGE_SIZE = 200;

/** The Room assigns `sequence`, and it is the Room's own `roomId`. */
export type RoomMessageDraft = Omit<RoomMessage, 'roomId' | 'sequence'>;

/** Sequences are 1-based, so page 1 holds 1..MESSAGE_PAGE_SIZE. */
export function messagePageOf(sequence: number): number {
  return Math.floor((sequence - 1) / MESSAGE_PAGE_SIZE) + 1;
}

/** A message reaches a member when it names it, or when it is a broadcast from someone else. */
export function addressesMember(message: RoomMessage, memberId: string): boolean {
  if (message.toMemberIds.length > 0) return message.toMemberIds.includes(memberId);
  return message.fromMemberId !== memberId;
}

/** Retired members hold no turn and never read, so counting them would inflate every pending badge. */
function recipientsOf(record: RoomRecord, message: RoomMessage): string[] {
  if (message.toMemberIds.length > 0) return message.toMemberIds;
  return record.members
    .filter((member) => member.status !== 'retired' && member.id !== message.fromMemberId)
    .map((member) => member.id);
}

export function assignSequences(roomId: string, drafts: RoomMessageDraft[], base: number): RoomMessage[] {
  return drafts.map((draft, i) => ({ ...draft, roomId, sequence: base + i + 1 }));
}

/** Advances the Room's sequence and each recipient's pending count in one step. */
export function withAppendedMessages(record: RoomRecord, messages: RoomMessage[]): RoomRecord {
  const pending = new Map<string, number>();
  for (const message of messages) {
    for (const memberId of recipientsOf(record, message)) {
      pending.set(memberId, (pending.get(memberId) ?? 0) + 1);
    }
  }
  const readCursors = record.readCursors.map((cursor) => {
    const added = pending.get(cursor.memberId);
    return added ? { ...cursor, pendingCount: cursor.pendingCount + added } : cursor;
  });
  const messageSequence = messages[messages.length - 1].sequence;
  return { ...record, runtime: { ...record.runtime, messageSequence }, readCursors };
}

/** Returns the same reference when the cursor does not move, so no file is rewritten. */
export function withAdvancedCursor(
  record: RoomRecord,
  memberId: string,
  lastReadSequence: number,
  pendingCount: number,
): RoomRecord {
  const current = record.readCursors.find((cursor) => cursor.memberId === memberId);
  if (!current || (current.lastReadSequence === lastReadSequence && current.pendingCount === pendingCount)) {
    return record;
  }
  const readCursors = record.readCursors.map((cursor) =>
    cursor.memberId === memberId ? { ...cursor, lastReadSequence, pendingCount } : cursor,
  );
  return { ...record, readCursors };
}

/**
 * Records a batch as leased. The cursor itself stays where it is: until the
 * turn accepts the prompt, those messages are still undelivered.
 */
export function withLease(record: RoomRecord, memberId: string, lease: MessageLease): RoomRecord {
  return {
    ...record,
    readCursors: record.readCursors.map((cursor) =>
      cursor.memberId === memberId ? { ...cursor, lease } : cursor,
    ),
  };
}

/**
 * The oldest sequence still owed to somebody, and so the point retention may
 * not prune past.
 *
 * A cursor is the floor whether or not it holds a lease: an unread member is
 * owed its messages just as much as a member whose batch is mid-flight, and a
 * replay reads from `lastReadSequence` in both cases. With no cursors at all
 * nothing is owed, so the latest sequence is the floor and normal retention
 * applies.
 */
export function undeliveredFloor(record: RoomRecord, latestSequence: number): number {
  const cursors = record.readCursors;
  return cursors.length === 0
    ? latestSequence
    : Math.min(...cursors.map((cursor) => cursor.lastReadSequence));
}

/** Commits the lease: the cursor jumps to it, and nothing is left outstanding. */
export function withAcknowledgedLease(record: RoomRecord, memberId: string): RoomRecord {
  const lease = record.readCursors.find((cursor) => cursor.memberId === memberId)?.lease;
  if (!lease) return record;
  const readCursors = record.readCursors.map((cursor) =>
    cursor.memberId === memberId
      ? { ...cursor, lastReadSequence: lease.throughSequence, pendingCount: lease.pendingCount, lease: null }
      : cursor,
  );
  return { ...record, readCursors };
}

export interface MessageLog {
  /** Appends to the pages the sequences fall in — one write per touched page. */
  write(roomId: string, messages: RoomMessage[]): Promise<void>;
  /** Reads forward from `afterSequence` (exclusive) up to `limit` matching messages. */
  read(
    roomId: string,
    afterSequence: number,
    latestSequence: number,
    limit: number,
    match?: (message: RoomMessage) => boolean,
  ): Promise<RoomMessage[]>;
  /**
   * Drops pages older than the retained window, but never one a member could
   * still read. `floorSequence` is the lowest sequence any cursor has yet to
   * consume: pruning past it does not merely forget history, it deletes
   * undelivered messages — and a leased batch would then replay as empty and be
   * acknowledged, which is the message loss the lease exists to prevent.
   */
  prune(roomId: string, latestSequence: number, keepPages: number, floorSequence: number): Promise<void>;
}

export function createMessageLog(appState: AppRuntimeStateApi, paths: RoomPaths): MessageLog {
  return {
    async write(roomId, messages) {
      const pages = new Map<number, RoomMessage[]>();
      for (const message of messages) {
        const page = messagePageOf(message.sequence);
        pages.set(page, [...(pages.get(page) ?? []), message]);
      }
      for (const [page, batch] of pages) {
        await appState.update<RoomMessage[]>(paths.messagePage(roomId, page), (current) => {
          // Replace by sequence rather than append. A page is written before the
          // Room state that accepts it, so a failed commit is retried with the
          // same sequences — a blind append would leave two copies of each, and
          // both would become visible once a later commit advanced the
          // authoritative sequence past them.
          const bySequence = new Map((current ?? []).map((message) => [message.sequence, message]));
          for (const message of batch) bySequence.set(message.sequence, message);
          return [...bySequence.values()].sort((left, right) => left.sequence - right.sequence);
        });
      }
    },

    async read(roomId, afterSequence, latestSequence, limit, match) {
      const found: RoomMessage[] = [];
      const lastPage = messagePageOf(latestSequence);
      for (let page = messagePageOf(afterSequence + 1); page <= lastPage && found.length < limit; page += 1) {
        // A missing page was pruned by retention; later pages still hold messages.
        const messages = (await appState.read<RoomMessage[]>(paths.messagePage(roomId, page))) ?? [];
        for (const message of messages) {
          if (message.sequence <= afterSequence) continue;
          // Never surface a message above the authoritative sequence. A page is
          // written before the room state that advances the sequence, so a
          // crash between the two can leave a message on disk that the Room has
          // not accepted — returning it would deliver work that never happened.
          if (message.sequence > latestSequence) continue;
          if (match && !match(message)) continue;
          found.push(message);
          if (found.length === limit) break;
        }
      }
      return found;
    },

    async prune(roomId, latestSequence, keepPages, floorSequence) {
      // The window is whichever is older: the retained page count, or the page
      // holding the oldest message still owed to somebody. Retention forgets
      // history; it must never consume a delivery.
      const windowStart = messagePageOf(latestSequence) - keepPages;
      const floorPage = messagePageOf(floorSequence + 1);
      // Pages are pruned oldest-first, so the first gap below the window ends the walk.
      for (let page = Math.min(windowStart, floorPage - 1); page >= 1; page -= 1) {
        const file = paths.messagePage(roomId, page);
        if (!existsSync(file)) break;
        await rm(file, { force: true });
      }
    },
  };
}
