// The attempt engine — the loop state machine around attempt execution
// (03 §Coordinator state machine). It is the only thing that advances an attempt
// (Principle 1). `run_next` is lock-first: the per-loop lock is acquired
// synchronously before any `await`, so two near-simultaneous requests cannot
// both start an attempt; the loser is rejected. Eligibility, budgets, and stop
// rules gate every transition; the actual change is delegated to an adapter
// (adapter.ts) — until one is registered (Phase 3/4) `run_next` reports the
// truthful "not yet".

import type { AppRuntimeHost } from '@sero-ai/common';

import type {
  BlockedReason,
  LoopGoal,
  OrchestratorActionResult,
} from '../shared/types';
import type { AdapterRegistry } from './adapter';
import { deleteAttemptArtifacts, trimAttempts } from './artifacts';
import { cumulativeBudgetExhausted } from './budget';
import { isoNow, type Clock } from './clock';
import { LoopLocks, Semaphore } from './locks';
import { runAttempt, type AttemptReport } from './attempt-runner';
import { openPullRequestForLoop } from './pr';
import type { StateStore } from './state-store';
import {
  blockReasonText,
  evaluateAfterAttempt,
  transitionReasonText,
} from './stop-rules';
import type { DirtyRootGate } from './vcs';

export interface EngineDeps {
  host: AppRuntimeHost;
  workspaceId: string;
  workspacePath: string;
  stateFilePath: string;
  store: StateStore;
  locks: LoopLocks;
  semaphore: Semaphore;
  adapters: AdapterRegistry;
  gate: DirtyRootGate;
  clock: Clock;
}

export interface RunNextOptions {
  overrideNoProgress?: boolean;
  /**
   * Trigger path only: if an attempt is already running for this loop, record a
   * single "due again" and run once more after the current attempt resolves,
   * rather than rejecting (03 §Scheduling — event during a running attempt).
   * Many events during one attempt collapse to one rerun.
   */
  queueIfBusy?: boolean;
}

const NOT_YET =
  'Running goals is not available yet — execution lands in a later phase.';

export class AttemptEngine {
  /** Per-loop cancellers for in-flight attempts (user stop/pause aborts these). */
  private readonly cancellers = new Map<string, AbortController>();
  /** Loops a trigger fired for while busy — drained once each resolves (D-02). */
  private readonly pendingReruns = new Set<string>();

  constructor(private readonly deps: EngineDeps) {}

  /** Abort a loop's in-flight attempt, if any (called by stop/pause). */
  cancel(loopId: string): void {
    this.cancellers.get(loopId)?.abort();
    // A stop/pause supersedes any queued trigger rerun for this loop.
    this.pendingReruns.delete(loopId);
  }

  async runNext(loopId: string, options: RunNextOptions = {}): Promise<OrchestratorActionResult> {
    const overrideNoProgress = options.overrideNoProgress ?? false;
    if (!this.deps.locks.tryAcquire(loopId)) {
      // Trigger-sourced run while busy: defer one rerun to after the in-flight
      // attempt resolves (per-loop lock still serializes attempts, D-11).
      if (options.queueIfBusy) {
        this.pendingReruns.add(loopId);
        return {
          ok: true,
          message: 'An attempt is already running; queued to run once after it finishes.',
        };
      }
      return { ok: false, error: 'An attempt is already running for this goal.' };
    }
    const cancel = new AbortController();
    this.cancellers.set(loopId, cancel);
    let semaphoreHeld = false;
    try {
      const loop = await this.deps.store.getLoop(loopId);
      if (!loop) return { ok: false, error: `No goal with id ${loopId}.` };

      const eligibility = checkEligibility(loop, overrideNoProgress);
      if (!eligibility.proceed) return { ...eligibility.result, loop };

      const resolved = await this.deps.adapters.resolve(loop, {
        host: this.deps.host,
        workspaceId: this.deps.workspaceId,
      });
      if (!resolved) return { ok: true, loop, message: NOT_YET };

      if (cumulativeBudgetExhausted(loop)) {
        const updated = await this.block(loopId, 'budget-exhausted');
        return { ok: true, loop: updated ?? loop, message: blockReasonText('budget-exhausted') };
      }

      if (!this.deps.semaphore.tryAcquire()) {
        return {
          ok: false,
          loop,
          error: 'This workspace is at its concurrent-attempt limit. Try again shortly.',
        };
      }
      semaphoreHeld = true;

      const report = await runAttempt(this.attemptDeps(), loop, {
        adapter: resolved.adapter,
        routingReason: resolved.routingReason,
        overrideNoProgress,
        activateOnStart: loop.status !== 'active',
        cancelSignal: cancel.signal,
      });
      return await this.finalize(loopId, report);
    } finally {
      if (semaphoreHeld) this.deps.semaphore.release();
      this.cancellers.delete(loopId);
      this.deps.locks.release(loopId);
      this.drainPendingRerun(loopId);
    }
  }

  /**
   * After the per-loop lock is released, run once more if a trigger fired while
   * the attempt was in flight. Scheduled off the stack so the just-finished
   * `runNext` returns first; eligibility/stop rules still gate the rerun, so a
   * loop that just completed/blocked simply no-ops.
   */
  private drainPendingRerun(loopId: string): void {
    if (!this.pendingReruns.delete(loopId)) return;
    queueMicrotask(() => {
      void this.runNext(loopId, { queueIfBusy: true }).catch(() => undefined);
    });
  }

  // ── transitions ────────────────────────────────────────────────────────────

  private async finalize(loopId: string, report: AttemptReport): Promise<OrchestratorActionResult> {
    if (report.deferred) {
      // Dirty-root defer keeps its specific wording; an adapter-supplied reason
      // (e.g. a busy active session) drives the generic message (D-05/D-07).
      const reason = report.deferReason ?? 'unsaved changes in the workspace root';
      const message = report.deferReason
        ? `Deferred: ${reason} — the goal retries on its next trigger.`
        : 'Deferred: unsaved changes — nothing was committed; the goal retries on its next trigger.';
      const updated = await this.deps.store.updateLoop(loopId, (loop) => {
        loop.statusReason = `Deferred: ${reason}.`;
        loop.updatedAt = isoNow(this.deps.clock);
      });
      return { ok: true, loop: updated ?? undefined, message };
    }

    const finalized = report.attempt!;
    let removedIds: string[] = [];
    const updated = await this.deps.store.updateLoop(loopId, (loop) => {
      const index = loop.attempts.findIndex((attempt) => attempt.id === finalized.id);
      if (index >= 0) loop.attempts[index] = finalized;
      else loop.attempts.push(finalized);

      if (!report.cancelled) {
        const transition = evaluateAfterAttempt({
          loop,
          attempt: finalized,
          requiredPassed: report.requiredPassed,
          changedFilesExceeded: report.changedFilesExceeded,
          overrodeNoProgress: Boolean(finalized.noProgressOverride),
        });
        loop.status = transition.status;
        loop.statusReason = transitionReasonText(transition);
        loop.blockedReason = transition.status === 'blocked' ? transition.reason : undefined;
      }

      removedIds = trimAttempts(loop).map((attempt) => attempt.id);
      loop.updatedAt = isoNow(this.deps.clock);
    });

    if (removedIds.length && updated && !updated.logPolicy.retainArtifacts) {
      await deleteAttemptArtifacts(this.deps.stateFilePath, removedIds);
    }

    // A completed worktree loop that opted in opens a PR (FR-21). This runs after
    // the status write (a separate, coordinator-owned write — single executor
    // holds) so the PR side effect never sits inside the transition mutation.
    let finalLoop = updated;
    let prNote: string | undefined;
    if (updated?.status === 'complete') {
      const pr = await this.maybeOpenPr(loopId, updated);
      finalLoop = pr.loop ?? finalLoop;
      prNote = pr.note;
    }
    const message = [outcomeMessage(finalLoop, report), prNote].filter(Boolean).join(' ');
    return { ok: true, loop: finalLoop ?? undefined, message };
  }

  /**
   * Open a PR for a just-completed loop when it opted in and ran in a worktree
   * (FR-21). Opt-in open only — merging stays a manual user action. Records the
   * PR ref on the loop and notifies; a failure notifies but never blocks the
   * completion.
   */
  private async maybeOpenPr(
    loopId: string,
    loop: LoopGoal,
  ): Promise<{ loop?: LoopGoal | null; note?: string }> {
    if (!loop.prPolicy?.openOnComplete || !loop.worktree || loop.pullRequest) return {};
    const outcome = await openPullRequestForLoop(
      { host: this.deps.host, clock: this.deps.clock },
      loop,
    );
    if (!outcome.ok) {
      this.deps.host.notifications.notify({
        type: 'warning',
        source: 'orchestrator',
        message: `Could not open a PR for "${loop.title}": ${outcome.reason}.`,
      });
      return { note: `PR not opened (${outcome.reason}).` };
    }
    const updated = await this.deps.store.updateLoop(loopId, (current) => {
      current.pullRequest = outcome.ref;
      current.updatedAt = isoNow(this.deps.clock);
    });
    this.deps.host.notifications.notify({
      type: 'info',
      source: 'orchestrator',
      message: `Opened PR #${outcome.ref.number} for "${loop.title}".`,
    });
    return { loop: updated, note: `Opened PR #${outcome.ref.number}.` };
  }

  private async block(loopId: string, reason: BlockedReason): Promise<LoopGoal | null> {
    return this.deps.store.updateLoop(loopId, (loop) => {
      loop.status = 'blocked';
      loop.blockedReason = reason;
      loop.statusReason = blockReasonText(reason);
      loop.updatedAt = isoNow(this.deps.clock);
    });
  }

  private attemptDeps() {
    return {
      host: this.deps.host,
      workspaceId: this.deps.workspaceId,
      workspacePath: this.deps.workspacePath,
      stateFilePath: this.deps.stateFilePath,
      store: this.deps.store,
      clock: this.deps.clock,
      gate: this.deps.gate,
    };
  }
}

// ── eligibility & messaging ────────────────────────────────────────────────────

type Eligibility =
  | { proceed: true }
  | { proceed: false; result: { ok: boolean; message?: string; error?: string } };

function checkEligibility(loop: LoopGoal, override: boolean): Eligibility {
  if (loop.status === 'complete' || loop.status === 'stopped') {
    return {
      proceed: false,
      result: { ok: true, message: `"${loop.title}" is ${loop.status}; there is nothing to run.` },
    };
  }
  if (loop.status === 'paused') {
    return {
      proceed: false,
      result: { ok: false, error: `"${loop.title}" is paused. Resume it before running.` },
    };
  }
  if (loop.status === 'blocked') {
    const overridable = loop.blockedReason === 'no-progress' || loop.blockedReason === undefined;
    if (!overridable) {
      return {
        proceed: false,
        result: { ok: false, error: `"${loop.title}" is ${blockReasonText(loop.blockedReason!)}` },
      };
    }
    if (!override) {
      return {
        proceed: false,
        result: {
          ok: false,
          error: `"${loop.title}" is blocked (no-progress). Override no-progress to force one more run, or resolve the blocker.`,
        },
      };
    }
  }
  return { proceed: true };
}

function outcomeMessage(loop: LoopGoal | null, report: AttemptReport): string {
  if (report.cancelled) return 'Attempt cancelled.';
  if (!loop) return 'Attempt finished.';
  const number = report.attempt?.attemptNumber ?? loop.attempts.length;
  switch (loop.status) {
    case 'complete':
      return `Attempt ${number} passed all required checks — goal complete.`;
    case 'stopped':
      return loop.statusReason ?? 'Stopped.';
    case 'blocked':
      return loop.statusReason ?? 'Blocked.';
    default:
      return `Attempt ${number} finished; checks did not all pass — will retry on the next run.`;
  }
}
