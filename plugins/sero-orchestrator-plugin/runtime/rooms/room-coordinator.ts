/**
 * The Room coordinator — the single component that advances a Room
 * (spec §15, §16, §26, architecture.md §9, §11).
 *
 * It owns the Room lifecycle and the scheduling pass. Everything else proposes:
 * the Conductor proposes revisions, members send messages, the UI sends
 * actions. All of those paths end here, and every write goes through the store,
 * so a Room has one writer and can never be advanced twice at once
 * (`LoopLocks`, the same discipline Workflow runs on).
 *
 * The wake path is EVENTS, not polling. A persisted reply, a finished turn or a
 * user action calls `advance` immediately; `tick` exists only to recover a Room
 * whose event was lost, and synthesizes no wake of its own (spec §16).
 *
 * Members reach their models through the host capability, via the member
 * session pool. This file never constructs a Pi session, never reads a
 * transcript, and never copies streamed output into Room state.
 */

import type { RoomMember } from '../../shared/room-types';
import type { OrchestratorHost } from '../host';
import { LoopLocks } from '../locks';
import { requirePersistentSessions } from './member-grant';
import type { MemberSessionPool, MemberTurnResult } from './member-session';
import {
  EMPTY_BRIEF_SOURCES,
  clearLadderReason,
  markTurnsStarted,
  renderTurnRequest,
  timelineEvent,
  withMember,
  withMemberStatus,
  withRoomStatus,
  type CreateRoomRequest,
} from './room-actions';
import { buildRoomBrief, setConductorNote, type BriefSources } from './room-brief';
import { compactMemberAtSafeBoundary } from './room-context';
import { checkIdleLimit } from './room-limits';
import {
  cancelRoom,
  completeRoom,
  createRoom,
  deleteRoom,
  pauseRoom,
  resumeRoom,
  settlePause,
  startRoom,
  type RoomActionResult,
  type RoomCoordinatorEvent,
} from './room-lifecycle';
import { reconcileAllRooms } from './room-reconcile';
import { scheduleRoomTurns, type ReadySignal, type WakeReason } from './room-scheduler';
import { escalate, handleStall, type StallContext } from './room-stall';
import type { RoomRecord } from './room-state';
import type { RoomStore } from './room-store';

export type { RoomActionResult, RoomCoordinatorEvent } from './room-lifecycle';

/** Messages handed to one member at the start of its turn. */
const MAX_MESSAGES_PER_TURN = 20;

/** Wake reasons that end a member's wait. Assigned work does not answer a question. */
const WAIT_ENDING_REASONS: readonly WakeReason[] = ['reply-received', 'user-intervention', 'direct-message'];

export interface RoomCoordinatorDeps {
  store: RoomStore;
  sessions: MemberSessionPool;
  /**
   * Work, artifacts and open questions for the brief. Phase 5 owns those
   * records; until then a Room has none, and the brief is computed from the
   * definition and the roster alone.
   */
  briefSources?(roomId: string): Promise<BriefSources>;
}

export class RoomCoordinator {
  private readonly locks = new LoopLocks();
  /** Rooms owed another pass because one was already running when they asked. */
  private readonly duePasses = new Set<string>();
  /** Ready signals collected since each Room's last pass (the event path). */
  private readonly signals = new Map<string, ReadySignal[]>();
  /** One abort handle per turn this process is running, keyed `roomId:memberId`. */
  private readonly turns = new Map<string, AbortController>();
  /** Post-compaction context a member's next turn must carry. Transient by design. */
  private readonly reprimes = new Map<string, string>();
  private readonly listeners = new Set<(event: RoomCoordinatorEvent) => void>();
  /** What lifecycle and stall handling are allowed to reach back through. */
  private readonly ctx: StallContext;

  constructor(
    private readonly host: OrchestratorHost,
    private readonly deps: RoomCoordinatorDeps,
  ) {
    this.ctx = {
      host,
      store: deps.store,
      sessions: deps.sessions,
      hasTurnsInFlight: (roomId) => this.hasTurnsInFlight(roomId),
      abortTurns: (roomId) => this.abortTurns(roomId),
      emit: (event) => this.emit(event),
      forgetSignals: (roomId) => this.signals.delete(roomId),
      wake: (roomId, memberId, reason) => this.wake(roomId, memberId, reason),
    };
  }

  onEvent(listener: (event: RoomCoordinatorEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ── Lifecycle (room-lifecycle.ts owns the transitions) ────

  createRoom(request: CreateRoomRequest): Promise<RoomActionResult> {
    return createRoom(this.ctx, request);
  }

  /** Requests the grant, opens the Conductor's session, then hands over to the scheduler. */
  async startRoom(roomId: string): Promise<RoomActionResult> {
    const result = await startRoom(this.ctx, roomId);
    if (!result.ok || !result.room) return result;
    const conductor = result.room.members.find((member) => member.isConductor);
    if (conductor) await this.advance(roomId, [{ memberId: conductor.id, reason: 'first-turn', at: this.host.now() }]);
    return { ...result, room: (await this.deps.store.readRoom(roomId)) ?? result.room };
  }

  pauseRoom(roomId: string, detail?: string): Promise<RoomActionResult> {
    return pauseRoom(this.ctx, roomId, detail);
  }

  async resumeRoom(roomId: string): Promise<RoomActionResult> {
    const result = await resumeRoom(this.ctx, roomId);
    if (!result.ok || !result.room) return result;
    const conductor = result.room.members.find((member) => member.isConductor && member.status !== 'retired');
    if (conductor) await this.wake(roomId, conductor.id, 'user-intervention');
    return { ...result, room: (await this.deps.store.readRoom(roomId)) ?? result.room };
  }

  cancelRoom(roomId: string, detail?: string): Promise<RoomActionResult> {
    return cancelRoom(this.ctx, roomId, detail);
  }

  completeRoom(roomId: string, summary?: string): Promise<RoomActionResult> {
    return completeRoom(this.ctx, roomId, summary);
  }

  deleteRoom(roomId: string): Promise<RoomActionResult> {
    return deleteRoom(this.ctx, roomId);
  }

  // ── The event path ────────────────────────────────────────

  /**
   * A targeted wake: a persisted reply, a direct message or a user
   * intervention. This is the normal path a waiting member comes back on, and
   * it advances the Room immediately (spec §16).
   *
   * A waiting member is not schedulable until its wait ends, so the wait is
   * cleared here — the state change and the ready signal must be one step, or
   * the scheduler drops the signal and the reply is lost.
   */
  async wake(roomId: string, memberId: string, reason: WakeReason): Promise<void> {
    const member = await this.deps.store.readMember(roomId, memberId);
    if (!member) return;
    if (WAIT_ENDING_REASONS.includes(reason) && (member.status === 'waiting' || member.status === 'blocked')) {
      await this.deps.store.updateMember(roomId, memberId, (current) => ({
        ...withMemberStatus(current, 'idle', 'Ready.'),
        waitingOnQuestionId: null,
      }));
    }
    await this.advance(roomId, [{ memberId, reason, at: this.host.now() }]);
  }

  /**
   * Structural progress (spec §21): completed work, a new artifact, a decision,
   * a changed blocker or an accepted revision. This is the ONLY place the brief
   * is rebuilt — a message is not progress, and rebuilding on every message
   * would turn the brief back into a transcript.
   */
  async noteStructuralProgress(roomId: string, summary: string): Promise<void> {
    const sources = await this.briefSources(roomId);
    const now = this.host.now();
    await this.deps.store.updateRoom(roomId, (current) => {
      const cleared = clearLadderReason(current);
      return {
        ...cleared,
        runtime: { ...cleared.runtime, lastProgressAt: now },
        brief: buildRoomBrief(cleared, sources, now),
      };
    });
    await this.deps.store.appendTimeline(roomId, [timelineEvent(this.host, roomId, 'work', null, summary)]);
    this.emit({ roomId, kind: 'progress', memberId: null, detail: summary });
    await this.advance(roomId);
  }

  /** The Conductor's situation note. Stored apart from every computed field (§15.1). */
  async publishConductorNote(roomId: string, note: string): Promise<void> {
    const now = this.host.now();
    await this.deps.store.updateRoom(roomId, (current) => ({
      ...current,
      brief: setConductorNote(current.brief, note, now),
    }));
  }

  // ── Scheduling ────────────────────────────────────────────

  /**
   * One scheduling pass. Concurrent callers do not queue a second pass: the
   * Room is marked due again and the lock holder drains it before releasing, so
   * a Room is never advanced twice at once and no wake is lost.
   */
  async advance(roomId: string, signals: ReadySignal[] = []): Promise<void> {
    this.enqueue(roomId, signals);
    if (!this.locks.tryAcquire(roomId)) {
      this.duePasses.add(roomId);
      return;
    }
    try {
      do {
        this.duePasses.delete(roomId);
        await this.pass(roomId);
      } while (this.duePasses.has(roomId));
    } finally {
      this.locks.release(roomId);
    }
  }

  private async pass(roomId: string): Promise<void> {
    const record = await this.deps.store.readRoom(roomId);
    if (!record) return;
    if (record.runtime.status !== 'running' && record.runtime.status !== 'ready') return;

    const nowMs = Date.parse(this.host.now());
    const inFlight = this.hasTurnsInFlight(roomId);
    const ready = this.readySignals(roomId);
    // Idle is measured only when the Room is genuinely still: a member mid-turn
    // has made no structural progress YET, and a Room holding a ready signal is
    // about to run. Escalating in either case would pause every Room whose first
    // turn takes longer than the idle window.
    if (!inFlight && ready.length === 0) {
      const idle = checkIdleLimit(record, nowMs);
      if (!idle.ok) return escalate(this.ctx, record, 'no-progress', idle.reason ?? 'Nothing has progressed.');
    }

    const decision = scheduleRoomTurns(record, ready, nowMs);
    if (decision.start.length === 0) return handleStall(this.ctx, record, decision, inFlight);

    const memberIds = decision.start.map((turn) => turn.memberId);
    for (const memberId of memberIds) this.turns.set(turnKey(roomId, memberId), new AbortController());
    this.consumeSignals(roomId, memberIds);
    await this.deps.store.updateRoom(roomId, (current) => markTurnsStarted(current, memberIds, this.host.now()));
    // Turns run outside the lock: holding it across a model call would serialize
    // the whole Room down to one member at a time.
    for (const memberId of memberIds) {
      void this.runTurn(roomId, memberId).catch((error: unknown) =>
        this.host.log(`room ${roomId}: turn for ${memberId} could not be settled: ${String(error)}`),
      );
    }
  }

  private async runTurn(roomId: string, memberId: string): Promise<void> {
    const key = turnKey(roomId, memberId);
    try {
      const result = await this.promptMember(roomId, memberId);
      // The slot is released BEFORE the turn is settled: a pause waiting for the
      // last turn to end reads this map, and it would wait for itself otherwise.
      this.turns.delete(key);
      await this.settleAfterTurn(roomId, memberId, result);
    } finally {
      this.turns.delete(key);
      // A freed slot is itself an event: whoever was held back by capacity can
      // start now, without waiting for the recovery tick.
      await this.advance(roomId);
    }
  }

  /**
   * Runs one member's turn. The pool opens or reuses its session, and records
   * the turn's status, usage and released slot in one write — this method adds
   * only what the turn should SAY.
   */
  private async promptMember(roomId: string, memberId: string): Promise<MemberTurnResult> {
    const record = await this.deps.store.readRoom(roomId);
    const member = record?.members.find((candidate) => candidate.id === memberId);
    if (!record || !member) return { turnId: null, status: 'error', detail: 'the member is gone', usage: null };

    // Persisted before delivery, and the cursor advances in the same write, so a
    // crash here re-delivers nothing and loses nothing (§17.1).
    const messages = await this.deps.store.takeMessagesFor(roomId, memberId, MAX_MESSAGES_PER_TURN);
    const sources = await this.briefSources(roomId);
    const key = turnKey(roomId, memberId);
    const reprime = this.reprimes.get(key);
    this.reprimes.delete(key);
    const prompt = reprime
      ? `${reprime}\n\n${renderTurnRequest(record, member, messages)}`
      : renderTurnRequest(record, member, messages);

    return this.deps.sessions
      .runTurn(record, member, { prompt, work: sources.work, signal: this.turns.get(key)?.signal })
      .catch((error: unknown) => ({
        turnId: null,
        status: 'error' as const,
        detail: error instanceof Error ? error.message : String(error),
        usage: null,
      }));
  }

  /**
   * What the coordinator owes after a member's turn: compaction at this safe
   * boundary, the Conductor-failure stop, and the pause that was waiting for
   * the last turn to end.
   */
  private async settleAfterTurn(roomId: string, memberId: string, result: MemberTurnResult): Promise<void> {
    this.emit({ roomId, kind: 'turn-ended', memberId, detail: result.detail });
    const record = await this.deps.store.readRoom(roomId);
    if (!record) return;
    const member = record.members.find((candidate) => candidate.id === memberId);
    const now = this.host.now();
    if (member && (member.status === 'working' || member.status === 'starting')) {
      // The pool records every turn it actually ran. A turn that never started —
      // a session that would not open, a pool at its cap — leaves the member
      // holding a slot, and the Room would wedge behind it. Its failure budget
      // is untouched: the member did nothing wrong.
      await this.deps.store.updateRoom(roomId, (current) =>
        withRoomStatus(
          withMember(current, memberId, (entry) => withMemberStatus(entry, 'idle', result.detail)),
          current.runtime.status,
          now,
        ),
      );
    }
    if (member) await this.compactIfNeeded(record, member);

    if (member?.isConductor && member.status === 'failed') {
      // No fallback Conductor in the first release: the Room pauses and asks the
      // user to retry, replace it or stop (§13.4).
      await settlePause(this.ctx, record, { kind: 'conductor-failed', detail: 'The Conductor failed too many times.', at: now }, now);
      return;
    }
    if (member?.status === 'failed') {
      this.host.notify(`${member.displayName} stopped after repeated failures.`, 'warning');
    }
    if (record.runtime.status === 'pausing' && !this.hasTurnsInFlight(roomId)) {
      const stopReason = record.runtime.stopReason ?? { kind: 'user-paused' as const, detail: 'Paused.', at: now };
      await settlePause(this.ctx, record, stopReason, now);
    }
  }

  /**
   * A finished turn is the safe boundary compaction waits for (§15.2). The
   * re-prime block is held for the member's next turn; losing it to a restart is
   * harmless, because every turn already carries the current brief.
   */
  private async compactIfNeeded(record: RoomRecord, member: RoomMember): Promise<void> {
    const sources = await this.briefSources(record.definition.id);
    const outcome = await compactMemberAtSafeBoundary(
      { sessions: requirePersistentSessions(this.host), store: this.deps.store, host: this.host },
      { room: record, member, work: sources.work },
    ).catch((error: unknown) => {
      // A usage reading that cannot be taken must never turn a finished turn
      // into a failed one (§30).
      this.host.log(`room ${record.definition.id}: context check failed: ${String(error)}`);
      return null;
    });
    if (!outcome) return;
    if (outcome.failure) {
      // A member whose context cannot be compacted is stopped before its window
      // is exhausted, rather than left to fail mid-turn (§30).
      await this.deps.store.updateMember(record.definition.id, member.id, (current) =>
        withMemberStatus(current, 'blocked', 'Its context could not be compacted, so it stopped.'),
      );
      return;
    }
    if (outcome.compacted) this.reprimes.set(turnKey(record.definition.id, member.id), outcome.reprime);
  }

  // ── Restart and recovery ──────────────────────────────────

  /**
   * Restart recovery. Reopens nothing eagerly: sessions reopen on demand, and
   * only the Conductor is woken, because an interrupted member's turn may
   * already have done its work and re-prompting it would repeat an external
   * write (spec §26, §30).
   */
  async reconcileRooms(options: { resume?: boolean } = {}): Promise<void> {
    const resumable = await reconcileAllRooms({ host: this.host, store: this.deps.store });
    if (options.resume === false) return;
    for (const roomId of resumable) {
      const record = await this.deps.store.readRoom(roomId);
      const conductor = record?.members.find((member) => member.isConductor && member.status !== 'retired');
      if (conductor) await this.wake(roomId, conductor.id, 'user-intervention');
    }
  }

  /**
   * Recovery only (spec §16). It synthesizes no ready signal: it re-evaluates
   * Rooms with nothing in flight, so a Room whose wake event was lost still
   * reaches its limits, its idle check and its stop reason. The normal wake
   * paths are `wake` and turn completion.
   */
  async tick(): Promise<void> {
    const state = await this.deps.store.readState();
    for (const record of state.rooms) {
      const roomId = record.definition.id;
      const live = record.runtime.status === 'running' || record.runtime.status === 'ready';
      if (!live || record.archivedAt) continue;
      if (this.hasTurnsInFlight(roomId)) continue;
      await this.advance(roomId);
    }
  }

  // ── Internals ─────────────────────────────────────────────

  private briefSources(roomId: string): Promise<BriefSources> {
    return this.deps.briefSources?.(roomId) ?? Promise.resolve(EMPTY_BRIEF_SOURCES);
  }

  private hasTurnsInFlight(roomId: string): boolean {
    for (const key of this.turns.keys()) if (key.startsWith(`${roomId}:`)) return true;
    return false;
  }

  private abortTurns(roomId: string): void {
    for (const [key, controller] of this.turns) {
      if (key.startsWith(`${roomId}:`)) controller.abort();
    }
  }

  /** Keeps one signal per member and reason; the earliest arrival wins a repeat. */
  private enqueue(roomId: string, incoming: ReadySignal[]): void {
    if (incoming.length === 0) return;
    const merged = [...(this.signals.get(roomId) ?? [])];
    for (const signal of incoming) {
      if (merged.some((held) => held.memberId === signal.memberId && held.reason === signal.reason)) continue;
      merged.push(signal);
    }
    this.signals.set(roomId, merged);
  }

  /** A member already taking a turn is not ready, whatever signal it collected. */
  private readySignals(roomId: string): ReadySignal[] {
    return (this.signals.get(roomId) ?? []).filter((signal) => !this.turns.has(turnKey(roomId, signal.memberId)));
  }

  /**
   * Drops only the signals for members that actually started. A member held back
   * by capacity keeps its signal, so it runs as soon as a slot frees rather than
   * waiting for another event that may never come.
   */
  private consumeSignals(roomId: string, memberIds: string[]): void {
    const started = new Set(memberIds);
    const kept = (this.signals.get(roomId) ?? []).filter((signal) => !started.has(signal.memberId));
    if (kept.length === 0) this.signals.delete(roomId);
    else this.signals.set(roomId, kept);
  }

  private emit(event: RoomCoordinatorEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function turnKey(roomId: string, memberId: string): string {
  return `${roomId}:${memberId}`;
}
