/**
 * The one-answer Orchestrator call running now.
 *
 * A call that returns one answer — the planner, a reflection, a stop-condition
 * check — shows its reply while it is written. These shapes are what the runtime
 * records and what a view waits on. Kept apart from the Loop and Room records so
 * neither has to carry the other's fields.
 *
 * Split out of types.ts (500-LOC limit); re-exported from there.
 */

/** Which one-answer Orchestrator call is running. */
export type LiveCallKind =
  | 'planner'
  | 'trigger'
  | 'refine'
  | 'reflect'
  | 'skill'
  | 'evaluator'
  | 'recovery'
  | 'stop'
  | 'event'
  /** Rethinking a Room's team before it starts. */
  | 'adjust';

/** A one-answer Orchestrator call shown while it runs. */
export interface LiveCall {
  kind: LiveCallKind;
  /** The tracker run id of the call, for the host live watch. */
  runId: string;
  /** The step the call belongs to, where one does. */
  stepId?: string;
  /** What the call is about, e.g. the event that arrived. */
  label?: string;
}

/**
 * A running call, told to the Orchestrator's own views.
 *
 * A wait the UI shows — a planner, a Room being designed — may have no record
 * the UI can read yet, so the runtime pushes the call to its views instead.
 */
export interface LiveCallNotice extends LiveCall {
  /** The Workflow the call belongs to, when one exists yet. */
  loopId?: string;
  /** The Room planning request the call belongs to. */
  requestId?: string;
  /** The Room being adjusted, when the call belongs to one. */
  roomId?: string;
}

/**
 * What identifies one running call.
 *
 * A view looks up the call it is waiting on by this, and an ended update names
 * only its own call — so one Workflow's reflection finishing cannot clear
 * another Workflow's stop-condition check.
 */
export interface LiveCallIdentity {
  loopId?: string;
  requestId?: string;
  roomId?: string;
  runId?: string;
}

/** One change to the calls running in this app. */
export type LiveCallUpdate =
  | { status: 'running'; call: LiveCallNotice }
  | { status: 'ended'; identity: LiveCallIdentity };

/** The key one call is held under. Every notice carries at least one field. */
export function liveCallKey(identity: LiveCallIdentity): string {
  return identity.loopId ?? identity.requestId ?? identity.roomId ?? identity.runId ?? '';
}
