// One attempt's lifecycle — the core's per-attempt engine, adapter-agnostic.
// It resolves the workdir, captures the pre-attempt baseRef (running the
// dirty-root gate when needed), persists a `running` attempt, delegates the
// change to the adapter under a hard timeout, then records what changed and runs
// the required checks. It does NOT decide the loop's next state — it returns a
// report and the finalized attempt; the engine applies stop rules and budgets
// (stop-rules.ts) in one state write.

import { randomUUID } from 'node:crypto';

import type {
  AttemptExecutionMode,
  AttemptWorkdir,
  CheckResult,
  DirtyRootDecision,
  LoopAttempt,
  LoopGoal,
  LoopWorktree,
} from '../shared/types';
import type { AttemptAdapter, AttemptExecutionResult } from './adapter';
import { changedFilesExceeded, attemptTimeoutMs, commandTimeoutMs } from './budget';
import { runChecks } from './checks';
import { runCriteria } from './criteria';
import { isoNow, type Clock } from './clock';
import { createCriterionJudge } from './judge';
import { requiredChecksPassed, requiredCriteriaPassed } from './stop-rules';
import { writeArtifact } from './artifacts';
import { createReviewerRunner } from './reviewers';
import { ensureLoopWorktree } from './worktree';
import {
  autoSaveBaseline,
  captureBaseRef,
  isWorkspaceDirty,
  restoreToBaseRef,
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
  /** Why hybrid routing picked this adapter; recorded on the attempt (D-09). */
  routingReason?: string;
  triggerId?: string;
  overrideNoProgress: boolean;
  /** Whether the loop must flip to `active` as this attempt starts (override / draft). */
  activateOnStart: boolean;
  /** External cancellation (user stop/pause); aborts the in-flight attempt. */
  cancelSignal: AbortSignal;
}

export interface AttemptReport {
  /** Defer: no attempt ran; the loop stays active for the next trigger. */
  deferred: boolean;
  /** Plain-English defer reason (dirty root, busy session, …); undefined → dirty-root default. */
  deferReason?: string;
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
  // Adapter readiness gate (D-05): runs before any worktree/baseline/attempt is
  // created so a not-ready adapter (e.g. a busy active session) defers cleanly —
  // no worktree spun up, no attempt recorded, the loop retries on its next trigger.
  if (opts.adapter.preflight) {
    const pre = await opts.adapter.preflight({
      loop,
      host: deps.host,
      workspaceId: deps.workspaceId,
      workspacePath: deps.workspacePath,
    });
    if (!pre.ready) {
      return {
        deferred: true,
        deferReason: pre.reason,
        cancelled: false,
        changedFilesExceeded: false,
        requiredPassed: false,
      };
    }
  }

  // Resolve the canonical workdir (workspace root or an in-workspace worktree,
  // D-06) together with the pre-attempt baseRef. cwd is canonical for every later
  // step (worker, checks, diff, VCS, artifacts).
  const resolved = await resolveWorkdir(deps, loop, opts.adapter.mode);
  if (resolved.defer) {
    return { deferred: true, cancelled: false, changedFilesExceeded: false, requiredPassed: false };
  }
  const { workdir, baseRef, decision, worktree } = resolved;

  const attempt: LoopAttempt = {
    id: `attempt-${randomUUID()}`,
    attemptNumber: nextAttemptNumber(loop),
    executionMode: opts.adapter.mode,
    routingReason: opts.routingReason,
    status: 'running',
    workdir,
    parentSessionId: loop.sessionId ?? `orchestrator:${loop.id}`,
    baseRef,
    dirtyRootDecision: decision,
    triggerId: opts.triggerId,
    noProgressOverride: opts.overrideNoProgress || undefined,
    changedFiles: [],
    checkResults: [],
    startedAt: isoNow(deps.clock),
  };

  await deps.store.updateLoop(loop.id, (current) => {
    current.attempts.push(attempt);
    // Persist a newly-created/isolated worktree so later attempts reuse it and
    // routing forces the background worker for the rest of the loop's life (D-06).
    if (worktree && !current.worktree) {
      current.worktree = worktree;
      current.isolation = 'worktree';
    }
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

  // A broken or incomplete attempt (worker error / timeout, not user cancel) is
  // rolled back to its baseline so the next attempt starts from a clean tree
  // (D-07). A completed-but-failing attempt keeps its changes so the next attempt
  // iterates forward on the same cwd.
  if (execution.status !== 'completed') {
    await restoreToBaseRef(deps.host, deps.workspaceId, workdir.cwd, attempt.baseRef, attempt.changedFiles);
    attempt.status = 'failed';
    attempt.learned = execution.summary ?? execution.error ?? `Attempt ${execution.status}.`;
    attempt.nextAction = 'Retry with the recorded failure as context.';
    attempt.endedAt = isoNow(deps.clock);
    return { deferred: false, attempt, cancelled: false, changedFilesExceeded: false, requiredPassed: false };
  }

  const { results, requiredPassed } = await runVerification(deps, loop, attempt, workdir.cwd);
  attempt.checkResults = results;
  attempt.status = requiredPassed ? 'passed' : 'failed';
  if (requiredPassed) {
    attempt.learned = execution.summary;
  } else {
    const failed = results.find((result) => result.status === 'failed');
    attempt.learned = [execution.summary, failed?.summary ?? 'A required check failed.']
      .filter(Boolean)
      .join('\n');
    attempt.nextAction = 'Address the failing check and retry.';
  }
  attempt.endedAt = isoNow(deps.clock);
  return { deferred: false, attempt, cancelled: false, changedFilesExceeded: false, requiredPassed };
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Run the attempt's verification at the canonical cwd. A loop with an
 * LLM-authored verification plan (spec 05) evaluates its criteria directly; a
 * legacy loop runs its `checks`. Both yield `CheckResult[]` (D-12) plus whether
 * every required item passed.
 */
async function runVerification(
  deps: RunAttemptDeps,
  loop: LoopGoal,
  attempt: LoopAttempt,
  cwd: string,
): Promise<{ results: CheckResult[]; requiredPassed: boolean }> {
  const base = {
    host: deps.host,
    workspaceId: deps.workspaceId,
    cwd,
    stateFilePath: deps.stateFilePath,
    attemptId: attempt.id,
    commandTimeoutMs: commandTimeoutMs(loop.budget),
    maxInlineOutputBytes: loop.logPolicy.maxInlineOutputBytes,
    baseRef: attempt.baseRef,
    clock: deps.clock,
  };
  const plan = loop.verificationPlan;
  if (plan) {
    const results = await runCriteria(
      {
        ...base,
        judge: createCriterionJudge({
          host: deps.host,
          workspaceId: deps.workspaceId,
          cwd,
          parentSessionId: attempt.parentSessionId,
          loop,
        }),
      },
      plan.criteria,
    );
    return { results, requiredPassed: requiredCriteriaPassed(plan.criteria, results) };
  }
  const results = await runChecks(
    {
      ...base,
      reviewer: createReviewerRunner({
        host: deps.host,
        workspaceId: deps.workspaceId,
        cwd,
        parentSessionId: attempt.parentSessionId,
        loop,
      }),
    },
    loop.checks,
  );
  return { results, requiredPassed: requiredChecksPassed(loop.checks, results) };
}

type WorkdirResolution =
  | { defer: true }
  | {
      defer: false;
      workdir: AttemptWorkdir;
      baseRef: string;
      decision?: DirtyRootDecision;
      /** A worktree created/reused this attempt — persisted on the loop by the caller. */
      worktree?: LoopWorktree;
    };

/**
 * Resolve the attempt's canonical cwd and pre-attempt baseRef (D-06/D-07).
 *
 * - A loop already configured for (or previously switched to) worktree isolation
 *   runs in its worktree — created on first use, reused after — with no dirty-root
 *   gate (its dirtiness across attempts is the loop's own iteration, not user
 *   work to preserve). Worktree isolation is background-worker only; an
 *   active-session attempt always resolves to workspace root.
 * - Otherwise the attempt runs at the workspace root. A clean root captures
 *   `HEAD` as the baseRef; a dirty root runs the start gate (D-07): auto-save
 *   commits the user's work as the baseline, defer stops here, and isolate
 *   reroutes to a fresh worktree leaving the dirty root untouched (the missing
 *   branch this phase adds — completes FR-26).
 */
async function resolveWorkdir(
  deps: RunAttemptDeps,
  loop: LoopGoal,
  adapterMode: AttemptExecutionMode,
): Promise<WorkdirResolution> {
  const canIsolate = adapterMode === 'background-worker';

  if (canIsolate && (loop.isolation === 'worktree' || loop.worktree)) {
    return resolveWorktree(deps, loop);
  }

  const cwd = deps.workspacePath;
  const rootWorkdir: AttemptWorkdir = { mode: 'workspace-root', workspaceRoot: cwd, cwd };
  if (!(await isWorkspaceDirty(deps.host, deps.workspaceId, cwd))) {
    return { defer: false, workdir: rootWorkdir, baseRef: await captureBaseRef(deps.host, deps.workspaceId, cwd) };
  }

  const choice = await deps.gate.prompt({ loopId: loop.id, loopTitle: loop.title, cwd });
  if (choice === 'defer') return { defer: true };
  // Isolate is only honoured for the background worker (D-06); an active session
  // can't run in a worktree, so any other adapter falls back to auto-save.
  if (choice === 'isolate' && canIsolate) {
    return resolveWorktree(deps, loop, 'isolated');
  }
  const saved = await autoSaveBaseline(deps.host, cwd);
  const baseRef = saved ?? (await captureBaseRef(deps.host, deps.workspaceId, cwd));
  return {
    defer: false,
    workdir: rootWorkdir,
    baseRef,
    decision: choice === 'timeout' ? 'auto-save-timeout' : 'auto-save',
  };
}

/** Create/reuse the loop's worktree and capture its baseRef. */
async function resolveWorktree(
  deps: RunAttemptDeps,
  loop: LoopGoal,
  decision?: DirtyRootDecision,
): Promise<Extract<WorkdirResolution, { defer: false }>> {
  const worktree = await ensureLoopWorktree(deps.host, deps.workspacePath, loop);
  const workdir: AttemptWorkdir = {
    mode: 'worktree',
    workspaceRoot: deps.workspacePath,
    cwd: worktree.path,
    worktreePath: worktree.path,
    branchName: worktree.branch,
  };
  const baseRef = await captureBaseRef(deps.host, deps.workspaceId, worktree.path);
  return { defer: false, workdir, baseRef, decision, worktree };
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
