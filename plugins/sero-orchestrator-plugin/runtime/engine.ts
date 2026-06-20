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
}

const NOT_YET =
  'Running goals is not available yet — execution lands in a later phase.';

export class AttemptEngine {
  /** Per-loop cancellers for in-flight attempts (user stop/pause aborts these). */
  private readonly cancellers = new Map<string, AbortController>();

  constructor(private readonly deps: EngineDeps) {}

  /** Abort a loop's in-flight attempt, if any (called by stop/pause). */
  cancel(loopId: string): void {
    this.cancellers.get(loopId)?.abort();
  }

  async runNext(loopId: string, options: RunNextOptions = {}): Promise<OrchestratorActionResult> {
    const overrideNoProgress = options.overrideNoProgress ?? false;
    if (!this.deps.locks.tryAcquire(loopId)) {
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

      const adapter = this.deps.adapters.resolve(loop.executionMode, loop);
      if (!adapter) return { ok: true, loop, message: NOT_YET };

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
        adapter,
        overrideNoProgress,
        activateOnStart: loop.status !== 'active',
        cancelSignal: cancel.signal,
      });
      return await this.finalize(loopId, report);
    } finally {
      if (semaphoreHeld) this.deps.semaphore.release();
      this.cancellers.delete(loopId);
      this.deps.locks.release(loopId);
    }
  }

  // ── transitions ────────────────────────────────────────────────────────────

  private async finalize(loopId: string, report: AttemptReport): Promise<OrchestratorActionResult> {
    if (report.deferred) {
      const updated = await this.deps.store.updateLoop(loopId, (loop) => {
        loop.statusReason = 'Deferred: unsaved changes in the workspace root.';
        loop.updatedAt = isoNow(this.deps.clock);
      });
      return {
        ok: true,
        loop: updated ?? undefined,
        message: 'Deferred: unsaved changes — nothing was committed; the goal retries on its next trigger.',
      };
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
    return { ok: true, loop: updated ?? undefined, message: outcomeMessage(updated, report) };
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
