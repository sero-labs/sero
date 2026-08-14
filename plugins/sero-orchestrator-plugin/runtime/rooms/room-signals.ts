/**
 * What a Room is holding for its next pass.
 *
 * Rooms are event-driven: something happens, a member becomes ready, a pass
 * runs. This is the book of what has happened since the last pass — kept apart
 * from the coordinator so that file stays inside the size limit, and so the
 * bookkeeping rules live in one place instead of four methods.
 *
 * Transient by design. A signal is an intention to run NOW; after a restart the
 * durable record is what says who owes a turn.
 */

import type { ReadySignal } from './room-scheduler';
import type { RoomRecord } from './room-state';

/**
 * The state of the Room as one member sees it: the last structural progress,
 * and how many turns EVERYONE ELSE has taken.
 *
 * A member is nudged at most once per mark, so counting other members' turns is
 * what separates the two silences that look alike. A member whose own empty turn
 * created the silence learns nothing by being asked again, and would spend the
 * Room's budget going round; a member whose colleague has just finished a turn
 * is looking at something new, and is the only one who can act on it.
 */
export function quietMark(record: RoomRecord, memberId: string): string {
  const elsewhere = record.members
    .filter((member) => member.id !== memberId)
    .reduce((turns, member) => turns + member.usage.turns, 0);
  return `${record.runtime.lastProgressAt ?? record.runtime.startedAt ?? ''}#${elsewhere}`;
}

export class RoomSignalBook {
  private readonly signals = new Map<string, ReadySignal[]>();
  /** The mark each member was last nudged on, keyed `roomId:memberId`. */
  private readonly quietWakes = new Map<string, string>();

  /** Keeps one signal per member and reason; the earliest arrival wins a repeat. */
  add(roomId: string, incoming: ReadySignal[]): void {
    if (incoming.length === 0) return;
    const merged = [...(this.signals.get(roomId) ?? [])];
    for (const signal of incoming) {
      if (merged.some((held) => held.memberId === signal.memberId && held.reason === signal.reason)) continue;
      merged.push(signal);
    }
    this.signals.set(roomId, merged);
  }

  /** Signals whose member is not already taking a turn. */
  ready(roomId: string, isRunning: (memberId: string) => boolean): ReadySignal[] {
    return (this.signals.get(roomId) ?? []).filter((signal) => !isRunning(signal.memberId));
  }

  /**
   * Drops only the signals for members that actually started. A member held back
   * by capacity keeps its signal, so it runs as soon as a slot frees rather than
   * waiting for another event that may never come.
   */
  consume(roomId: string, memberIds: string[]): void {
    const started = new Set(memberIds);
    const kept = (this.signals.get(roomId) ?? []).filter((signal) => !started.has(signal.memberId));
    if (kept.length === 0) this.signals.delete(roomId);
    else this.signals.set(roomId, kept);
  }

  /**
   * True the first time this member is asked about a given mark.
   *
   * Per member, because one Room can owe two different nudges at once — an
   * answer from one member and an unread assignment to another — and a single
   * shared claim would silently drop the second.
   */
  claimQuietWake(roomId: string, memberId: string, mark: string): boolean {
    const key = `${roomId}:${memberId}`;
    if (this.quietWakes.get(key) === mark) return false;
    this.quietWakes.set(key, mark);
    return true;
  }

  forget(roomId: string): void {
    this.signals.delete(roomId);
    for (const key of [...this.quietWakes.keys()]) {
      if (key.startsWith(`${roomId}:`)) this.quietWakes.delete(key);
    }
  }
}
