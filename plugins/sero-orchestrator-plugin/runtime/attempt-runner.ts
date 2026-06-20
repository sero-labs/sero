// One attempt's lifecycle — the core's per-attempt engine, adapter-agnostic.
// It resolves the workdir, captures the pre-attempt baseRef (running the
// dirty-root gate when needed), persists a `running` attempt, delegates the
// change to the adapter under a hard timeout, then records what changed and runs
// the required checks. It does NOT decide the loop's next state — it returns a
// report and the finalized attempt; the engine applies stop rules and budgets
// (stop-rules.ts) in one state write.

import { randomUUID } from 'node:crypto';

import type {
  AttemptWorkdir,
  DirtyRootDecision,
  LoopAttempt,
  LoopGoal,
} from '../shared/types';
import type { AttemptAdapter, AttemptExecutionResult } from './adapter';
import { changedFilesExceeded, attemptTimeoutMs, commandTimeoutMs } from './budget';
import { runChecks } from './checks';
import { isoNow, type Clock } from './clock';
import { requiredChecksPassed } from './stop-rules';
import { writeArtifact } from './artifacts';
import {
  autoSaveBaseline,
  captureBaseRef,
  isWorkspaceDirty,
  type DirtyRootGate,
} from './vcs';
import type { StateStore } from './state-store';
import type { AppRuntimeHost } from '@sero-ai/common';

export interface RunAttemptDeps {
  host: AppRuntimeHost;
  workspaceId: string;
  workspacePath: string;
  stateFilePath: string;
  store: StateStore;
  clock: Clock;
  gate: DirtyRootGate;
}

export interface RunAttemptOptions {
  adapter: AttemptAdapter;
  triggerId?: string;
  overrideNoProgress: boolean;
  /** Whether the loop must flip to `active` as this attempt starts (override / draft). */
  activateOnStart: boolean;
  /** External cancellation (user stop/pause); aborts the in-flight attempt. */
  cancelSignal: AbortSignal;
}

export interface AttemptReport {
  /** Dirty-root defer: no attempt ran; the loop stays active for the next trigger. */
  deferred: boolean;
  /** Finalized attempt record (absent only when deferred). */
  attempt?: LoopAttempt;
  /** Cancelled mid-flight — the loop's status was set by stop/pause, not here. */
  cancelled: boolean;
  changedFilesExceeded: boolean;
  requiredPassed: boolean;
}

export async function runAttempt(
  deps: RunAttemptDeps,
  loop: LoopGoal,
  opts: RunAttemptOptions,
): Promise<AttemptReport> {
  // Phase 2: workspace-root only. Worktree isolation is Phase 6; active-session
  // is permanently workspace-root (D-06). cwd is canonical for every later step.
  const workdir: AttemptWorkdir = {
    mode: 'workspace-root',
    workspaceRoot: deps.workspacePath,
    cwd: deps.workspacePath,
  };

  const baseline = await resolveBaseline(deps, loop, workdir.cwd);
  if (baseline.defer) {
    return { deferred: true, cancelled: false, changedFilesExceeded: false, requiredPassed: false };
  }

  const attempt: LoopAttempt = {
    id: `attempt-${randomUUID()}`,
    attemptNumber: nextAttemptNumber(loop),
    executionMode: opts.adapter.mode,
    status: 'running',
    workdir,
    parentSessionId: loop.sessionId ?? `orchestrator:${loop.id}`,
    baseRef: baseline.baseRef,
    dirtyRootDecision: baseline.decision,
    triggerId: opts.triggerId,
    noProgressOverride: opts.overrideNoProgress || undefined,
    changedFiles: [],
    checkResults: [],
    startedAt: isoNow(deps.clock),
  };

  await deps.store.updateLoop(loop.id, (current) => {
    current.attempts.push(attempt);
    if (opts.activateOnStart) {
      current.status = 'active';
      current.statusReason = undefined;
      current.blockedReason = undefined;
    }
    current.updatedAt = isoNow(deps.clock);
  });

  const execution = await execute(deps, loop, attempt, workdir.cwd, opts.adapter, opts.cancelSignal);
  applyExecution(attempt, execution);
  if (execution.response) {
    attempt.workerResponsePath = await writeArtifact(
      deps.stateFilePath,
      attempt.id,
      'worker-response.txt',
      execution.response,
    );
  }

  if (opts.cancelSignal.aborted) {
    attempt.status = 'cancelled';
    attempt.endedAt = isoNow(deps.clock);
    return { deferred: false, attempt, cancelled: true, changedFilesExceeded: false, requiredPassed: false };
  }

  if (changedFilesExceeded(loop.budget, attempt.changedFiles)) {
    attempt.status = 'blocked';
    attempt.nextAction = `Changed ${attempt.changedFiles.length} files (limit ${loop.budget?.maxChangedFiles}); kept for review.`;
    attempt.endedAt = isoNow(deps.clock);
    return { deferred: false, attempt, cancelled: false, changedFilesExceeded: true, requiredPassed: false };
  }

  if (execution.status !== 'completed') {
    attempt.status = 'failed';
    attempt.learned = execution.error ?? `Attempt ${execution.status}.`;
    attempt.nextAction = 'Retry with the recorded failure as context.';
    attempt.endedAt = isoNow(deps.clock);
    return { deferred: false, attempt, cancelled: false, changedFilesExceeded: false, requiredPassed: false };
  }

  const results = await runChecks(
    {
      host: deps.host,
      workspaceId: deps.workspaceId,
      cwd: workdir.cwd,
      stateFilePath: deps.stateFilePath,
      attemptId: attempt.id,
      commandTimeoutMs: commandTimeoutMs(loop.budget),
      maxInlineOutputBytes: loop.logPolicy.maxInlineOutputBytes,
      clock: deps.clock,
    },
    loop.checks,
  );
  attempt.checkResults = results;
  const requiredPassed = requiredChecksPassed(loop.checks, results);
  attempt.status = requiredPassed ? 'passed' : 'failed';
  if (!requiredPassed) {
    const failed = results.find((result) => result.status === 'failed');
    attempt.learned = failed?.summary ?? 'A required check failed.';
    attempt.nextAction = 'Address the failing check and retry.';
  }
  attempt.endedAt = isoNow(deps.clock);
  return { deferred: false, attempt, cancelled: false, changedFilesExceeded: false, requiredPassed };
}

// ── helpers ──────────────────────────────────────────────────────────────────

interface Baseline {
  defer: boolean;
  baseRef: string;
  decision?: DirtyRootDecision;
}

async function resolveBaseline(
  deps: RunAttemptDeps,
  loop: LoopGoal,
  cwd: string,
): Promise<Baseline> {
  const dirty = await isWorkspaceDirty(deps.host, deps.workspaceId, cwd);
  if (!dirty) {
    return { defer: false, baseRef: await captureBaseRef(deps.host, deps.workspaceId, cwd) };
  }
  const choice = await deps.gate.prompt({ loopId: loop.id, loopTitle: loop.title, cwd });
  if (choice === 'defer') return { defer: true, baseRef: '' };
  const saved = await autoSaveBaseline(deps.host, cwd);
  const baseRef = saved ?? (await captureBaseRef(deps.host, deps.workspaceId, cwd));
  return {
    defer: false,
    baseRef,
    decision: choice === 'timeout' ? 'auto-save-timeout' : 'auto-save',
  };
}

/** Run the adapter under a combined timeout + cancellation signal. */
async function execute(
  deps: RunAttemptDeps,
  loop: LoopGoal,
  attempt: LoopAttempt,
  cwd: string,
  adapter: AttemptAdapter,
  cancelSignal: AbortSignal,
): Promise<AttemptExecutionResult> {
  const timeoutMs = attemptTimeoutMs(loop);
  const controller = new AbortController();
  const onCancel = () => controller.abort();
  if (cancelSignal.aborted) controller.abort();
  else cancelSignal.addEventListener('abort', onCancel);
  const timer =
    timeoutMs != null && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await adapter.execute({
      loop,
      attempt,
      cwd,
      host: deps.host,
      workspaceId: deps.workspaceId,
      signal: controller.signal,
      timeoutMs,
    });
  } finally {
    if (timer) clearTimeout(timer);
    cancelSignal.removeEventListener('abort', onCancel);
  }
}

function applyExecution(attempt: LoopAttempt, execution: AttemptExecutionResult): void {
  attempt.changedFiles = execution.changedFiles ?? [];
  attempt.diffFingerprint = execution.diffFingerprint;
  attempt.usage = execution.usage;
  attempt.model = execution.model;
  attempt.sessionTurnId = execution.sessionTurnId;
  attempt.workerRunId = execution.workerRunId;
}

function nextAttemptNumber(loop: LoopGoal): number {
  return loop.attempts.reduce((max, attempt) => Math.max(max, attempt.attemptNumber), 0) + 1;
}
