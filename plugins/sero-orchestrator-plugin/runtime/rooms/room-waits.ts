/**
 * Open questions and wait-cycle detection (FR-020, spec §17.3).
 *
 * A member's wait is DURABLE state: `member.waitingOnQuestionId` says what it is
 * blocked on, and that survives a restart. What this file adds is the other half
 * of the edge — who owes the answer — which lives on the question message.
 *
 * That lookup is an index, not state. It is filled as questions are asked and
 * rebuilt from the durable message log when a lookup misses, so nothing here is
 * ever the source of truth for whether a member is waiting.
 */

import type { RoomMessage } from '../../shared/room-message-types';
import { buildWaitEdges } from './room-actions';
import { detectWaitCycles } from './room-scheduler';
import type { RoomRecord } from './room-state';
import type { RoomStore } from './room-store';

/** How far back a cold lookup reads for the questions waiting members named. */
const QUESTION_SCAN = 500;

export interface WaitIndex {
  /** Remembers a question that a member may now be blocked on. */
  remember(roomId: string, question: RoomMessage): void;
  /** Drops a question that has been answered or withdrawn. */
  resolve(roomId: string, questionId: string): void;
  /** The question message, from the index or from the durable log. */
  find(record: RoomRecord, questionId: string): Promise<RoomMessage | null>;
  /**
   * Cycles among waiting members. Empty when nobody can be SHOWN to be stuck —
   * a missing question is not evidence of a deadlock.
   */
  detect(roomId: string): Promise<string[][]>;
  forget(roomId: string): void;
}

export function createWaitIndex(store: RoomStore): WaitIndex {
  /** roomId → questionId → the question message. */
  const questions = new Map<string, Map<string, RoomMessage>>();
  /** roomId → message sequence the last cold scan covered. */
  const scannedTo = new Map<string, number>();

  function indexOf(roomId: string): Map<string, RoomMessage> {
    const found = questions.get(roomId);
    if (found) return found;
    const created = new Map<string, RoomMessage>();
    questions.set(roomId, created);
    return created;
  }

  /**
   * Rebuilds the index from the durable log. Bounded on purpose: a question a
   * member is still blocked on is recent by definition, and an unbounded rescan
   * on every quiet pass would read the whole Room's history.
   *
   * Repeating the scan at the same sequence would find the same nothing, so it
   * runs once per new message.
   */
  async function rescan(record: RoomRecord): Promise<void> {
    const roomId = record.definition.id;
    const latest = record.runtime.messageSequence;
    if (scannedTo.get(roomId) === latest) return;
    scannedTo.set(roomId, latest);

    const index = indexOf(roomId);
    const from = Math.max(0, latest - QUESTION_SCAN);
    const messages = await store.readMessages(roomId, from, QUESTION_SCAN);
    for (const message of messages) {
      if (message.kind === 'question' && message.questionId) index.set(message.questionId, message);
      // A question that was already answered or withdrawn is closed. Without
      // this a rebuilt index would offer a settled question as open, and a
      // member could be told to wait on an answer that already arrived.
      if (message.inReplyToQuestionId) index.delete(message.inReplyToQuestionId);
      if (message.kind === 'cancel' && message.questionId) index.delete(message.questionId);
    }
  }

  async function find(record: RoomRecord, questionId: string): Promise<RoomMessage | null> {
    const index = indexOf(record.definition.id);
    if (!index.has(questionId)) await rescan(record);
    if (!index.has(questionId)) {
      let after = 0;
      while (after < record.runtime.messageSequence) {
        const messages = await store.readMessages(record.definition.id, after, QUESTION_SCAN);
        if (messages.length === 0) break;
        for (const message of messages) {
          if (message.kind === 'question' && message.questionId === questionId) index.set(questionId, message);
          if (message.inReplyToQuestionId === questionId) index.delete(questionId);
          if (message.kind === 'cancel' && message.questionId === questionId) index.delete(questionId);
        }
        after = messages[messages.length - 1].sequence;
      }
    }
    return index.get(questionId) ?? null;
  }

  return {
    remember(roomId, question) {
      if (question.questionId) indexOf(roomId).set(question.questionId, question);
    },

    resolve(roomId, questionId) {
      questions.get(roomId)?.delete(questionId);
    },

    find,

    async detect(roomId) {
      const record = await store.readRoom(roomId);
      if (!record) return [];
      const wanted = record.members.flatMap((member) =>
        member.status === 'waiting' && member.waitingOnQuestionId ? [member.waitingOnQuestionId] : [],
      );
      // One waiting member cannot be a cycle, and proving that would cost a page
      // read on every quiet pass.
      if (wanted.length < 2) return [];

      const found: RoomMessage[] = [];
      for (const questionId of wanted) {
        const question = await find(record, questionId);
        if (question) found.push(question);
      }
      return detectWaitCycles(buildWaitEdges(record, found));
    },

    forget(roomId) {
      questions.delete(roomId);
      scannedTo.delete(roomId);
    },
  };
}
