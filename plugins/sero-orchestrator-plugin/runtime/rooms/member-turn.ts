/**
 * Turn bookkeeping for a member session: watching one turn to completion, and
 * writing what it cost back onto the Room (spec §16, §21, §30).
 *
 * Split from member-session.ts to keep both files well inside the size limit.
 * Nothing here opens, closes or owns a session — it is given a live handle.
 *
 * Two properties matter more than the mechanics:
 *
 *  - **Nothing streamed is kept.** This module reads turn boundaries only; the
 *    text a member produces belongs to its Pi session, and the one transient
 *    view of it lives in `room-observation.ts` (NFR-002, NFR-016).
 *  - **The runtime is the single writer.** Member usage and the Room total move
 *    in ONE store write, and the total is recomputed from the members rather
 *    than accumulated separately, so the two cannot drift apart.
 */

import type { PersistentSessionUsage, PersistentSessionsApi } from '@sero-ai/common';
import type { MemberStatus, MemberUsage, RoomMember, RoomUsage } from '../../shared/room-types';
import type { OrchestratorHost } from '../host';
import type { RoomStore } from './room-store';

export type MemberTurnStatus = 'completed' | 'aborted' | 'error';

export interface TurnOutcome {
  turnId: string | null;
  status: MemberTurnStatus;
  /** Plain English. Becomes the member's `statusDetail`. */
  detail: string;
}

export interface TurnWatch {
  /** Resolves when `turnId` ends. Aborting the signal aborts the turn first. */
  settle(turnId: string, signal?: AbortSignal): Promise<TurnOutcome>;
  stop(): void;
}

const TURN_DETAIL: Record<MemberTurnStatus, string> = {
  completed: 'Finished its turn.',
  aborted: 'Turn cancelled.',
  error: 'Turn failed.',
};

/**
 * Subscribes to a live session and resolves the turn it is told to watch.
 *
 * Subscription happens BEFORE the prompt is sent, and completions that arrive
 * early are remembered: a fast turn can end before `prompt()` resolves with its
 * own turn id, and a watcher that only listened forward would wait for ever.
 *
 * It watches ONLY the turn boundary. Streamed text is not this module's
 * business: `room-observation.ts` subscribes for that, so there is exactly one
 * live-output buffer rather than one per caller.
 */
export function watchTurn(api: PersistentSessionsApi, handleId: string): TurnWatch {
  const ended = new Map<string, MemberTurnStatus>();
  let pending: { turnId: string; resolve: (outcome: TurnOutcome) => void } | null = null;

  const unsubscribe = api.subscribe(handleId, (event) => {
    if (event.type !== 'turn_end') return;
    ended.set(event.turnId, event.status);
    if (pending?.turnId === event.turnId) {
      pending.resolve({ turnId: event.turnId, status: event.status, detail: TURN_DETAIL[event.status] });
      pending = null;
    }
  });

  return {
    settle: (turnId, signal) =>
      new Promise<TurnOutcome>((resolve) => {
        const already = ended.get(turnId);
        if (already) {
          resolve({ turnId, status: already, detail: TURN_DETAIL[already] });
          return;
        }
        pending = { turnId, resolve };
        // Cancellation still waits for `turn_end`: the session is only free once
        // the host says the turn stopped, and releasing it earlier would let the
        // pool close a session that is still executing.
        signal?.addEventListener('abort', () => void api.abort(handleId), { once: true });
      }),
    stop: unsubscribe,
  };
}

/**
 * Usage for the whole session, or null when it cannot be read. A telemetry read
 * must never turn a finished turn into a failed one (spec §30).
 */
export async function readSessionUsage(
  api: PersistentSessionsApi,
  handleId: string,
): Promise<PersistentSessionUsage | null> {
  try {
    return await api.getSessionUsage(handleId);
  } catch {
    return null;
  }
}

/** Marks a member as holding an execution slot. One write for member and Room. */
export function markMemberWorking(
  store: RoomStore,
  roomId: string,
  memberId: string,
): Promise<void> {
  return store.updateRoom(roomId, (record) => ({
    ...record,
    members: record.members.map((member) =>
      member.id === memberId
        ? // A member that is running is no longer blocked on the question that
          // woke it, so the wait is cleared with the same write.
          { ...member, status: 'working' as MemberStatus, statusDetail: 'Working.', waitingOnQuestionId: null }
        : member,
    ),
    runtime: {
      ...record.runtime,
      activeMemberIds: [...new Set([...record.runtime.activeMemberIds, memberId])],
    },
  }));
}

/**
 * Session usage is CUMULATIVE for that session, so it replaces the member's
 * counters instead of adding to them — a re-read after a retry can then never
 * double-count. With no reading, only the turn count moves.
 */
function applyUsage(current: MemberUsage, session: PersistentSessionUsage | null): MemberUsage {
  if (!session) return { ...current, turns: current.turns + 1 };
  return {
    ...current,
    costUsd: session.costUsd,
    inputTokens: session.inputTokens,
    outputTokens: session.outputTokens,
    cacheReadTokens: session.cacheReadTokens,
    cacheWriteTokens: session.cacheWriteTokens,
    turns: session.turns,
  };
}

/**
 * Where a member lands after its turn.
 *
 * A member that ended its turn by asking a question is already `waiting`, so
 * anything other than `working` is left alone — the completion write must not
 * resurrect a waiting member as idle.
 *
 * One failure is not a dead member either: the counter is bounded, and the
 * scheduler stops selecting the member once its approved consecutive-failure
 * budget is spent. Only then does it become `failed`, so a transient provider
 * error costs a retry rather than a member.
 */
function nextStatus(member: RoomMember, outcome: TurnOutcome, failures: number, maxFailures: number): MemberStatus {
  if (member.status !== 'working') return member.status;
  if (outcome.status === 'error' && failures >= maxFailures) return 'failed';
  return 'idle';
}

function applyTurn(
  member: RoomMember,
  outcome: TurnOutcome,
  session: PersistentSessionUsage | null,
  maxFailures: number,
): RoomMember {
  // An abort is a cancellation, not a failure, so it never spends the budget.
  const failures = outcome.status === 'error' ? member.usage.consecutiveFailures + 1 : 0;
  return {
    ...member,
    status: nextStatus(member, outcome, failures, maxFailures),
    statusDetail: outcome.detail,
    usage: {
      ...applyUsage(member.usage, session),
      retries: outcome.status === 'error' ? member.usage.retries + 1 : member.usage.retries,
      consecutiveFailures: failures,
    },
  };
}

/** The Room total is the sum of its members. Roster counters are not usage. */
function aggregateRoomUsage(current: RoomUsage, members: RoomMember[]): RoomUsage {
  const total = (pick: (usage: MemberUsage) => number): number =>
    members.reduce((sum, member) => sum + pick(member.usage), 0);
  return {
    ...current,
    costUsd: total((usage) => usage.costUsd),
    inputTokens: total((usage) => usage.inputTokens),
    outputTokens: total((usage) => usage.outputTokens),
    turns: total((usage) => usage.turns),
  };
}

/**
 * Records a finished turn: member status, usage, retries and failures, the Room
 * total and the released execution slot — one write, so a reader never sees a
 * member that finished while the Room still counts it as active.
 *
 * `lastProgressAt` is deliberately untouched. A turn is not structural progress:
 * a Room that talks to itself for ever must still trip the no-progress limit.
 */
export async function recordMemberTurn(
  host: OrchestratorHost,
  store: RoomStore,
  roomId: string,
  memberId: string,
  outcome: TurnOutcome,
  session: PersistentSessionUsage | null,
): Promise<MemberUsage | null> {
  await store.updateRoom(roomId, (record) => {
    const members = record.members.map((member) =>
      member.id === memberId
        ? applyTurn(member, outcome, session, record.definition.envelope.maxConsecutiveFailures)
        : member,
    );
    return {
      ...record,
      members,
      runtime: {
        ...record.runtime,
        activeMemberIds: record.runtime.activeMemberIds.filter((id) => id !== memberId),
        usage: aggregateRoomUsage(record.runtime.usage, members),
      },
    };
  });

  await store.appendTimeline(roomId, [
    {
      id: host.newId('evt'),
      roomId,
      at: host.now(),
      kind: 'member-status',
      memberId,
      summary: outcome.detail,
      // Small and redacted: never the prompt, the reply or a credential.
      details: { status: outcome.status, turnId: outcome.turnId ?? '' },
    },
  ]);
  // Read back rather than returned from the updater: the store is the single
  // source of truth, and this is a cache read.
  return (await store.readMember(roomId, memberId))?.usage ?? null;
}
