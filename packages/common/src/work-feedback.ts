/**
 * Scoped work feedback (spec live-work-feedback).
 *
 * One bounded metadata snapshot per producer: who is working, what call it
 * holds open, when it last did something and when it was last seen. Lists,
 * widgets and overviews read these snapshots. They carry no prompt, no tool
 * argument or result, no output text and no reasoning, so a surface can follow
 * work without opening a transcript watch.
 *
 * Two facts stay apart:
 *
 *   contact   the producer holds an in-flight request or tool call in this
 *             session. Derived from the open `request-start` / `tool-start`
 *             state, so it needs no renewal timer.
 *   activity  the producer did something a user would call progress: it wrote
 *             output, started or finished a tool, finished a request.
 *
 * A quiet model request renews contact and leaves the activity time alone.
 *
 * The epoch is the producing runtime's session. A snapshot from another epoch
 * proves nothing about now, so it reads as last known. The revision orders
 * snapshots inside one epoch, so a late event cannot roll a view back.
 */

import type { ActivityState } from './activity-state';
import type { PersistentSessionEvent } from './app-runtime-persistent-sessions';
import { createRunIdCapture, type ObservationOperationKind, type ObservationOutcome, type ObservationRecord } from './run-observations';

/** The identities that exist for this producer. An absent one is unknown, never guessed. */
export interface WorkFeedbackScope {
  appId: string;
  workspaceId: string | null;
  projectId?: string;
  /** The Workflow or the Room the work belongs to. A list row matches on this. */
  workId?: string;
  /** One run of that Workflow. */
  runId?: string;
  attemptId?: string;
  sessionId?: string;
  memberId?: string;
  /** The producer this one works for. Set only when the runtime made that link itself. */
  parentKey?: string;
}

/** The call the producer holds open. `since` is null when the source gave no start time. */
export type WorkFeedbackWait =
  | { kind: 'request'; since: string | null; model?: string }
  | { kind: 'tool'; toolName: string | null; since: string | null };

export interface WorkFeedback {
  /** Unique per producer in its runtime. */
  key: string;
  kind: ObservationOperationKind;
  /** Who does the work, named by the runtime: a member, a step's agent, the owner. */
  owner: string;
  /** What the work is, named by the runtime: a step title, a Room title. Never agent prose. */
  subject?: string;
  scope: WorkFeedbackScope;
  epoch: string;
  revision: number;
  turnId: string | null;
  /** True while the producer is attached in its epoch. */
  attached: boolean;
  wait: WorkFeedbackWait | null;
  /** Calls open now. More than one means parallel tools. */
  openCalls: number;
  lastActivityAt: string | null;
  contactObservedAt: string | null;
  /** Set once the work ended. A terminal fact stays terminal. */
  terminal: { outcome: ObservationOutcome; at: string | null } | null;
  usage?: { costUsd?: number; incomplete: boolean };
  limits?: { maxCostUsd?: number; maxActiveMs?: number };
  /**
   * The host tracker id of a structured run, once the run reported it. A view
   * the user opens can watch that run's live output with it. It is an id, and
   * carries no output.
   */
  watchRunId?: string;
}

export type WorkFeedbackEvent =
  | { type: 'turn-start'; turnId: string | null; at: string | null }
  | { type: 'request-start'; id: string | null; model?: string; at: string | null }
  | { type: 'request-end'; id: string | null; at: string | null }
  | { type: 'tool-start'; id: string | null; toolName: string | null; at: string | null }
  | { type: 'tool-end'; id: string | null; at: string | null }
  /** Output was written. Carries no text. */
  | { type: 'output'; at: string | null }
  | { type: 'usage'; costUsd?: number; incomplete: boolean }
  /** The structured run named its tracker id. */
  | { type: 'run-id'; runId: string }
  /** The turn ended and the producer stays, as a persistent session does. */
  | { type: 'turn-end'; at: string | null }
  /** The work ended for good. */
  | { type: 'end'; outcome: ObservationOutcome; at: string | null }
  /** The producer went away without reporting an end. */
  | { type: 'lost' };

export interface WorkFeedbackInit {
  key: string;
  kind: ObservationOperationKind;
  owner: string;
  subject?: string;
  scope: WorkFeedbackScope;
  limits?: WorkFeedback['limits'];
}

interface OpenCall {
  kind: 'request' | 'tool';
  toolName: string | null;
  model?: string;
  since: string | null;
}

export interface FeedbackProducer {
  observe(event: WorkFeedbackEvent): WorkFeedback;
  snapshot(): WorkFeedback;
}

/**
 * Folds one producer's events into its snapshot. `nextRevision` is shared by
 * every producer of a runtime, so a producer recreated under the same key
 * still sorts after the one it replaced.
 */
export function createFeedbackProducer(init: WorkFeedbackInit, epoch: string, nextRevision: () => number): FeedbackProducer {
  const open = new Map<string, OpenCall>();
  let state: WorkFeedback = {
    ...init, epoch, revision: nextRevision(), turnId: null, attached: false, wait: null, openCalls: 0,
    lastActivityAt: null, contactObservedAt: null, terminal: null,
  };

  const currentWait = (): WorkFeedbackWait | null => {
    const calls = [...open.values()];
    // A running tool says more than the request that asked for it.
    const call = calls.filter((entry) => entry.kind === 'tool').at(-1) ?? calls.at(-1);
    if (!call) return null;
    return call.kind === 'tool'
      ? { kind: 'tool', toolName: call.toolName, since: call.since }
      : { kind: 'request', since: call.since, ...(call.model ? { model: call.model } : {}) };
  };

  const apply = (event: WorkFeedbackEvent): Partial<WorkFeedback> => {
    // Terminal facts stay. A late event from the ended work changes nothing.
    if (state.terminal && event.type !== 'usage') return {};
    const at = 'at' in event ? event.at : null;
    const contact = at ? { contactObservedAt: at } : {};
    const activity = at ? { lastActivityAt: at, contactObservedAt: at } : {};
    switch (event.type) {
      case 'turn-start':
        open.clear();
        return { turnId: event.turnId, attached: true, ...contact };
      case 'request-start':
        open.set(`request:${event.id ?? ''}`, { kind: 'request', toolName: null, since: event.at, ...(event.model ? { model: event.model } : {}) });
        // Contact only: a request that has started has produced nothing yet.
        return { attached: true, ...contact };
      case 'request-end':
        open.delete(`request:${event.id ?? ''}`);
        return { ...activity };
      case 'tool-start':
        open.set(`tool:${event.id ?? ''}`, { kind: 'tool', toolName: event.toolName, since: event.at });
        return { attached: true, ...activity };
      case 'tool-end':
        open.delete(`tool:${event.id ?? ''}`);
        return { ...activity };
      case 'output':
        return { attached: true, ...activity };
      case 'run-id':
        return { watchRunId: event.runId };
      case 'usage':
        return { usage: { ...(event.costUsd !== undefined ? { costUsd: event.costUsd } : {}), incomplete: event.incomplete } };
      case 'turn-end':
        open.clear();
        return { attached: false, turnId: null, ...activity };
      case 'end':
        open.clear();
        return { attached: false, terminal: { outcome: event.outcome, at: event.at }, ...activity };
      case 'lost':
        // No end was reported, so the calls are not known to have closed. The
        // snapshot keeps what was last seen and stops claiming contact.
        open.clear();
        return { attached: false };
    }
  };

  return {
    observe(event) {
      const change = apply(event);
      state = { ...state, ...change, wait: currentWait(), openCalls: open.size, revision: nextRevision() };
      return state;
    },
    snapshot: () => state,
  };
}

/** A persistent-session event as feedback. `at` is the host clock, for the events that carry no time. */
export function feedbackEventFromSession(event: PersistentSessionEvent, at: string): WorkFeedbackEvent | null {
  switch (event.type) {
    case 'turn_start': return { type: 'turn-start', turnId: event.turnId || null, at: event.at };
    case 'request_start': return { type: 'request-start', id: event.requestId, at: event.at, ...(event.model ? { model: event.model } : {}) };
    case 'request_end': return { type: 'request-end', id: event.requestId, at: event.at };
    case 'tool_start': return { type: 'tool-start', id: event.callId, toolName: event.toolName, at: event.at };
    case 'tool_end': return { type: 'tool-end', id: event.callId, at: event.at };
    case 'text': return { type: 'output', at };
    case 'turn_end': return { type: 'turn-end', at: event.at };
    case 'compacted': return null;
  }
}

/** A run observation as feedback. A time the source did not report stays null. */
export function feedbackEventFromObservation(record: ObservationRecord): WorkFeedbackEvent | null {
  const { requestId, toolCallId, turnId } = record.identities;
  const started = record.startedAt ?? null;
  const ended = record.endedAt ?? null;
  switch (record.kind) {
    case 'operation-start':
    case 'turn-start': return { type: 'turn-start', turnId: turnId ?? null, at: started };
    case 'request-start': return { type: 'request-start', id: requestId ?? null, at: started, ...(record.model ? { model: record.model } : {}) };
    case 'request-end': return { type: 'request-end', id: requestId ?? null, at: ended };
    // The record has no tool name: it is metadata only by construction.
    case 'tool-start': return { type: 'tool-start', id: toolCallId ?? null, toolName: null, at: started };
    case 'tool-end': return { type: 'tool-end', id: toolCallId ?? null, at: ended };
    case 'turn-end': return { type: 'turn-end', at: ended };
    case 'operation-end': return { type: 'end', outcome: record.outcome ?? 'unknown', at: ended };
    case 'compaction': return null;
  }
}

/**
 * Which snapshot a reader keeps. One from another epoch never replaces one
 * from the current epoch, and inside an epoch the higher revision wins, so an
 * event that arrives late or out of order cannot bring older work back.
 */
export function mergeFeedback(current: WorkFeedback | undefined, incoming: WorkFeedback, epoch: string): WorkFeedback | undefined {
  if (incoming.epoch !== epoch) return current;
  if (!current || current.epoch !== epoch) return incoming;
  return incoming.revision > current.revision ? incoming : current;
}

/**
 * The shared activity word for one snapshot. `working` needs an attached
 * producer in the reader's epoch. A saved or stale snapshot is last known. A
 * known end keeps its real outcome, and silence is never called failure.
 */
export function feedbackActivity(feedback: WorkFeedback, epoch: string): Extract<ActivityState, 'working' | 'last-known' | 'complete' | 'stopped'> {
  if (feedback.terminal) {
    if (feedback.terminal.outcome === 'ok') return 'complete';
    return feedback.terminal.outcome === 'unknown' ? 'last-known' : 'stopped';
  }
  return feedback.epoch === epoch && feedback.attached ? 'working' : 'last-known';
}

/** How long the open call has waited, or null when its start was not measured. */
export function feedbackWaitMs(feedback: WorkFeedback, nowMs: number): number | null {
  const since = feedback.wait?.since;
  if (!since) return null;
  const started = Date.parse(since);
  return Number.isNaN(started) ? null : Math.max(0, nowMs - started);
}

export interface FeedbackSummary {
  /** Producers working now. */
  activeCount: number;
  /** The first few of them, so a parent never shows one worker as the whole run. */
  current: Pick<WorkFeedback, 'key' | 'owner' | 'subject' | 'wait'>[];
  lastActivityAt: string | null;
  contactObservedAt: string | null;
}

const latest = (a: string | null, b: string | null): string | null => (!a ? b : !b ? a : a > b ? a : b);

/** A parent's account of the work under it. Bounded, and it names concurrency instead of hiding it. */
export function summarizeFeedback(snapshots: readonly WorkFeedback[], epoch: string, limit = 3): FeedbackSummary {
  const active = snapshots.filter((entry) => feedbackActivity(entry, epoch) === 'working');
  return {
    activeCount: active.length,
    current: active.slice(0, limit).map(({ key, owner, subject, wait }) => ({ key, owner, wait, ...(subject ? { subject } : {}) })),
    lastActivityAt: snapshots.reduce<string | null>((at, entry) => latest(at, entry.lastActivityAt), null),
    contactObservedAt: active.reduce<string | null>((at, entry) => latest(at, entry.contactObservedAt), null),
  };
}

/** What a surface asks a runtime for when it starts observing, before any pushed update. */
export interface FeedbackSnapshotReply {
  epoch: string;
  snapshots: WorkFeedback[];
}

/** Applies a reply or a pushed update to a reader's map. Returns the same map when nothing changed. */
export function applyFeedback(current: ReadonlyMap<string, WorkFeedback>, incoming: readonly WorkFeedback[], epoch: string): ReadonlyMap<string, WorkFeedback> {
  let next: Map<string, WorkFeedback> | null = null;
  for (const snapshot of incoming) {
    const kept = mergeFeedback((next ?? current).get(snapshot.key), snapshot, epoch);
    if (!kept || kept === (next ?? current).get(snapshot.key)) continue;
    next ??= new Map(current);
    next.set(snapshot.key, kept);
  }
  return next ?? current;
}

export interface FeedbackProjection {
  readonly epoch: string;
  /** Starts a producer. Opening a key again replaces the earlier producer. */
  open(init: WorkFeedbackInit): { observe(event: WorkFeedbackEvent): void };
  list(match?: (feedback: WorkFeedback) => boolean): WorkFeedback[];
  reply(match?: (feedback: WorkFeedback) => boolean): FeedbackSnapshotReply;
  /** Marks every matching producer lost: a disposed session, a stopped runtime. */
  lose(match: (feedback: WorkFeedback) => boolean): void;
  drop(key: string): void;
}

/** Ended work kept for late readers. The oldest goes first. */
const MAX_ENDED = 100;
/** Output arrives per token. One update a second says the same thing to a list. */
const OUTPUT_GAP_MS = 1000;

/**
 * The in-memory projection one runtime keeps. It lives in memory only, so it
 * never outlasts its epoch, and nothing is written to a record or an index for
 * a contact update. `emit` pushes each changed snapshot to observing surfaces.
 */
export function createFeedbackProjection(epoch: string, emit: (feedback: WorkFeedback) => void = () => {}): FeedbackProjection {
  const producers = new Map<string, FeedbackProducer>();
  const outputEmittedAt = new Map<string, number>();
  let revision = 0;
  const nextRevision = () => ++revision;

  const trim = (): void => {
    const ended = [...producers].filter(([, producer]) => producer.snapshot().terminal);
    for (const [key] of ended.slice(0, Math.max(0, ended.length - MAX_ENDED))) producers.delete(key);
  };

  const observe = (key: string, producer: FeedbackProducer, event: WorkFeedbackEvent): void => {
    if (producers.get(key) !== producer) return;
    const snapshot = producer.observe(event);
    if (event.type === 'output') {
      const at = event.at ? Date.parse(event.at) : Number.NaN;
      const last = outputEmittedAt.get(key);
      if (last !== undefined && !Number.isNaN(at) && at - last < OUTPUT_GAP_MS) return;
      if (!Number.isNaN(at)) outputEmittedAt.set(key, at);
    }
    if (snapshot.terminal) { outputEmittedAt.delete(key); trim(); }
    emit(snapshot);
  };

  return {
    epoch,
    open(init) {
      const producer = createFeedbackProducer(init, epoch, nextRevision);
      producers.set(init.key, producer);
      outputEmittedAt.delete(init.key);
      return { observe: (event) => observe(init.key, producer, event) };
    },
    list: (match = () => true) => [...producers.values()].map((producer) => producer.snapshot()).filter(match),
    reply(match) { return { epoch, snapshots: this.list(match) }; },
    lose(match) {
      for (const [key, producer] of producers) {
        const snapshot = producer.snapshot();
        if (snapshot.attached && match(snapshot)) observe(key, producer, { type: 'lost' });
      }
    },
    drop(key) { producers.delete(key); outputEmittedAt.delete(key); },
  };
}

export interface RunFeedback {
  onObservation(record: ObservationRecord): void;
  onUsage(usage: { costUsd?: number; incomplete?: boolean }): void;
  /** The run returned. Without an error it ended ok; with one it failed. */
  end(result: { error?: string }, at: string): void;
}

/**
 * Feedback for one structured run, the kind a step, a planner call or direct
 * research makes. The run's own observations drive it, so it reports before
 * the run completes, and the caller ends it when the call returns because the
 * run reports no end of its own.
 */
export function openRunFeedback(projection: FeedbackProjection, init: WorkFeedbackInit): RunFeedback {
  const producer = projection.open(init);
  // The run's own first record carries the tracker id. Later records carry the
  // subagent session's id, which a watch cannot use.
  const captureRunId = createRunIdCapture();
  return {
    onObservation(record) {
      const runId = captureRunId(record);
      if (runId) producer.observe({ type: 'run-id', runId });
      const event = feedbackEventFromObservation(record);
      // The call's end is the caller's to report: an `operation-end` from a
      // repair pass must not end the run it belongs to.
      if (event && event.type !== 'end') producer.observe(event);
    },
    // Usage that is still arriving is incomplete until the run says otherwise.
    onUsage: (usage) => producer.observe({ type: 'usage', incomplete: usage.incomplete !== false, ...(usage.costUsd !== undefined ? { costUsd: usage.costUsd } : {}) }),
    end: (result, at) => producer.observe({ type: 'end', outcome: result.error ? 'failed' : 'ok', at }),
  };
}
