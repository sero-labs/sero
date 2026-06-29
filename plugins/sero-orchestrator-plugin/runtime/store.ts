/**
 * Pure helpers for the split persistence layout (one file per loop + a small
 * index). The host adapter does the file I/O around these; keeping the compose,
 * summarize, and diff logic pure makes it directly testable.
 *
 * The diff is by loop REFERENCE: callers update state immutably (the coordinator
 * and run engine map/spread, keeping unchanged loops by reference), so an
 * unchanged loop's file is never rewritten when another loop changes.
 */

import type {
  Loop,
  LoopAttention,
  LoopRun,
  LoopSummary,
  OrchestratorIndex,
  OrchestratorState,
  RunIndex,
} from '../shared/types';
import { aggregateUsage } from '../shared/usage';

/**
 * The compact "needs you" content embedded in a loop summary, so the home inbox
 * resolves questions/suggestions inline from the watched index alone (no per-loop
 * reads). Returns undefined when the loop is not waiting on the user, keeping the
 * index small. See specs/09-ui-redesign.md.
 */
function toAttention(loop: Loop): LoopAttention | undefined {
  const pending = loop.runtime.pendingInput;
  const input = pending
    ? { requestId: pending.id, source: pending.source, questions: pending.questions }
    : undefined;
  const suggestions = (loop.suggestions ?? [])
    .filter((s) => s.status === 'pending')
    .map((s) => ({
      id: s.id,
      rationale: s.rationale,
      confidence: s.confidence,
      changedStepCount: s.changedStepIds.length,
    }));
  if (!input && suggestions.length === 0) return undefined;
  return { input, suggestions: suggestions.length ? suggestions : undefined };
}

/**
 * The slimmed loop persisted to loop.json: run history and revisions are stored
 * in their own files (runs/<id>.json + runs/index.json, revisions.json), so the
 * loop file stays bounded no matter how many times the loop runs.
 */
export function stripLoopForPersist(loop: Loop): Loop {
  return { ...loop, runs: [], revisions: [] };
}

/** Compact summary of one run for the per-loop runs/index.json. */
export function toRunSummary(run: LoopRun): RunIndex['runs'][number] {
  return {
    id: run.id,
    runNumber: run.runNumber,
    status: run.status,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    completionStatus: run.completionSignal?.status,
    steps: run.stepAttempts.map((a) => ({
      stepId: a.stepId,
      attemptNumber: a.attemptNumber,
      executionType: a.executionType,
      status: a.status,
      outcomeStatus: a.outcome?.status,
    })),
    recoveries: run.recoveryDecisions.map((d) => ({ decision: d.decision, reason: d.reason })),
    usage: aggregateUsage(run.stepAttempts),
  };
}

export function buildRunIndex(runs: LoopRun[]): RunIndex {
  return { version: 1, runs: runs.map(toRunSummary) };
}

export interface RunsDiff {
  /** Runs to (over)write — new or value-changed. */
  changed: LoopRun[];
  /** Run ids present before but gone now (pruned by retention). */
  removedIds: string[];
  /** Whether runs/index.json needs rewriting. */
  indexChanged: boolean;
}

/**
 * Diffs runs by VALUE (serialized), not reference: the single writer reads state
 * via structuredClone, so even unchanged runs arrive as fresh objects — a
 * reference diff would rewrite every run file on every step. Comparing content
 * rewrites only the run that actually changed (the active one) and leaves
 * historical run files untouched.
 */
export function diffRuns(prev: LoopRun[], next: LoopRun[]): RunsDiff {
  const prevById = new Map(prev.map((r) => [r.id, JSON.stringify(r)]));
  const changed = next.filter((r) => prevById.get(r.id) !== JSON.stringify(r));
  const nextIds = new Set(next.map((r) => r.id));
  const removedIds = prev.filter((r) => !nextIds.has(r.id)).map((r) => r.id);
  return { changed, removedIds, indexChanged: changed.length > 0 || removedIds.length > 0 };
}

export function toSummary(loop: Loop): LoopSummary {
  const pendingSuggestions = (loop.suggestions ?? []).filter((s) => s.status === 'pending').length;
  const pendingInput = loop.runtime.pendingInput?.questions.length ?? 0;
  return {
    id: loop.id,
    title: loop.title,
    status: loop.status,
    summary: loop.summary,
    prompt: loop.prompt,
    pendingSuggestions: pendingSuggestions || undefined,
    pendingInput: pendingInput || undefined,
    attention: toAttention(loop),
    libraryLink: loop.libraryLink,
    createdAt: loop.createdAt,
    updatedAt: loop.updatedAt,
  };
}

export function buildIndex(state: OrchestratorState): OrchestratorIndex {
  return { version: 1, loops: state.loops.map(toSummary) };
}

export function composeState(loops: Loop[]): OrchestratorState {
  return { version: 1, loops };
}

export interface StateDiff {
  /** Loops to (over)write — changed by reference or newly added. */
  changed: Loop[];
  /** Loop ids whose files/folders should be removed. */
  removedIds: string[];
  /** Whether the summary index needs rewriting. */
  indexChanged: boolean;
}

export function diffState(prev: OrchestratorState, next: OrchestratorState): StateDiff {
  const prevById = new Map(prev.loops.map((l) => [l.id, l]));
  const changed = next.loops.filter((l) => prevById.get(l.id) !== l);
  const nextIds = new Set(next.loops.map((l) => l.id));
  const removedIds = prev.loops.filter((l) => !nextIds.has(l.id)).map((l) => l.id);
  const indexChanged = JSON.stringify(buildIndex(prev)) !== JSON.stringify(buildIndex(next));
  return { changed, removedIds, indexChanged };
}
