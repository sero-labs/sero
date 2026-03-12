/**
 * Orchestrator — poll loop, dispatch decisions, state machine owner.
 *
 * In-memory state: running map, claimed set, retry_attempts, completed set.
 * Poll tick: reconcile → validate → fetch candidates → sort → dispatch.
 */

import type {
  SymphonyConfig,
  SymphonyState,
  RunningEntry,
  AgentTotals,
} from '../shared/types';
import { DEFAULT_SYMPHONY_STATE } from '../shared/types';
import type { IssueTracker } from './tracker';
import { createTracker } from './tracker';
import { Reconciler } from './reconciler';
import { RetryManager } from './retry-manager';
import { WorkspaceManager } from './workspace-manager';
import { AgentRunner } from './agent-runner';
import type { AgentResult } from './agent-runner';
import { selectCandidates, dispatchWorker } from './dispatcher';
import { info, warn, error as logError } from './logger';

// ── Orchestrator ───────────────────────────────────────────────

export class Orchestrator {
  private config: SymphonyConfig;
  private promptTemplate: string;

  // Core components
  private tracker: IssueTracker;
  private reconciler: Reconciler;
  private retryManager: RetryManager;
  private workspaceManager: WorkspaceManager;

  // In-memory state
  private running = new Map<string, RunningEntry>();
  private runners = new Map<string, AgentRunner>();
  private claimed = new Set<string>();
  private completed = new Set<string>();
  private agentTotals: AgentTotals = { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 };

  // Poll loop
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private active = false;
  private startedAt: number | null = null;

  // State snapshot callback
  private onStateChange: ((state: SymphonyState) => void) | null = null;
  private debouncedEmitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: SymphonyConfig, promptTemplate: string) {
    this.config = config;
    this.promptTemplate = promptTemplate;

    this.tracker = createTracker(config);
    this.workspaceManager = new WorkspaceManager(config.workspace, config.hooks);

    this.reconciler = new Reconciler(config, this.tracker, {
      killRun: (issueId, reason) => this.killRun(issueId, reason),
      updateIssueState: (issueId, state) => this.updateIssueState(issueId, state),
    });

    this.retryManager = new RetryManager(config.agent, {
      onRetryReady: (issueId, attempt) => this.handleRetry(issueId, attempt),
    });
  }

  // ── Lifecycle ────────────────────────────────────────────────

  start(onStateChange?: (state: SymphonyState) => void): void {
    if (this.active) return;

    this.active = true;
    this.startedAt = Date.now();
    this.onStateChange = onStateChange ?? null;

    this.pollTimer = setInterval(() => {
      this.pollTick().catch((err) => {
        logError('orchestrator:poll-error', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.config.polling.interval_ms);

    // Run first tick immediately
    this.pollTick().catch(() => {});

    info('orchestrator:started', {
      pollIntervalMs: this.config.polling.interval_ms,
      maxConcurrent: this.config.agent.max_concurrent,
    });

    this.emitState();
  }

  stop(): void {
    if (!this.active) return;

    this.active = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.debouncedEmitTimer) {
      clearTimeout(this.debouncedEmitTimer);
      this.debouncedEmitTimer = null;
    }

    // Kill all running agents
    for (const [issueId, runner] of this.runners) {
      runner.kill();
      this.runners.delete(issueId);
    }

    this.retryManager.cancelAll();
    this.tracker.destroy();
    this.running.clear();
    this.runners.clear();
    this.claimed.clear();

    info('orchestrator:stopped');
    this.emitState();
  }

  isActive(): boolean {
    return this.active;
  }

  /** Trigger an immediate poll cycle. */
  async refresh(): Promise<void> {
    if (!this.active) return;
    await this.pollTick();
  }

  /** Update config + prompt template (hot reload). */
  reload(config: SymphonyConfig, promptTemplate: string): void {
    this.config = config;
    this.promptTemplate = promptTemplate;

    // Recreate tracker if kind changed
    if (this.tracker.kind !== config.tracker.kind) {
      this.tracker.destroy();
      this.tracker = createTracker(config);
    }

    this.reconciler.setConfig(config);
    this.reconciler.setTracker(this.tracker);
    this.workspaceManager = new WorkspaceManager(config.workspace, config.hooks);

    // Reset poll interval
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => {
        this.pollTick().catch(() => {});
      }, config.polling.interval_ms);
    }

    info('orchestrator:reloaded');
    this.emitState();
  }

  /** Get current state snapshot. */
  getState(): SymphonyState {
    return {
      ...DEFAULT_SYMPHONY_STATE,
      serviceActive: this.active,
      workflowPath: null, // Set by extension/index.ts
      workflowValid: true,
      workflowError: null,
      pollIntervalMs: this.config.polling.interval_ms,
      maxConcurrentAgents: this.config.agent.max_concurrent,
      running: Array.from(this.running.values()),
      retrying: this.retryManager.getEntries(),
      completed: Array.from(this.completed),
      agentTotals: { ...this.agentTotals },
      rateLimits: null,
      lastPollAt: null,
      lastError: null,
      trackerKind: this.config.tracker.kind,
      trackerLabel: this.config.tracker.kind === 'linear'
        ? this.config.tracker.project_slug
        : this.config.tracker.issues_dir.split('/').pop() ?? null,
    };
  }

  // ── Poll tick (Section 8.1) ──────────────────────────────────

  private async pollTick(): Promise<void> {
    if (!this.active) return;

    // 1. Reconcile active runs
    await this.reconciler.reconcile(Array.from(this.running.values()));

    // 2. Fetch candidates
    let candidates;
    try {
      candidates = await this.tracker.fetchCandidateIssues();
    } catch (err) {
      warn('orchestrator:fetch-failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    // 3. Filter out completed issues and select candidates
    const uncompleted = candidates.filter((c) => !this.completed.has(c.id));
    const selected = selectCandidates(
      uncompleted,
      this.claimed,
      this.running.size,
      this.config,
    );

    for (const issue of selected) {
      this.claimed.add(issue.id);
      dispatchWorker(
        issue,
        this.promptTemplate,
        this.config,
        this.workspaceManager,
        {
          onRunStarted: (entry, runner) => this.onRunStarted(entry, runner),
          onRunFinished: (issueId, result) => this.onRunFinished(issueId, result),
          onRunUpdate: (issueId, updates) => this.onRunUpdate(issueId, updates),
        },
        0,
      ).catch(() => {});
    }

    // Update timing
    if (this.startedAt) {
      this.agentTotals.secondsRunning = Math.floor((Date.now() - this.startedAt) / 1000);
    }

    this.emitState();
  }

  // ── Run lifecycle callbacks ──────────────────────────────────

  private onRunStarted(entry: RunningEntry, runner: AgentRunner): void {
    this.running.set(entry.issueId, entry);
    this.runners.set(entry.issueId, runner);
    this.emitState();
  }

  private onRunFinished(issueId: string, result: AgentResult): void {
    const entry = this.running.get(issueId);
    this.running.delete(issueId);
    this.runners.delete(issueId);

    // Accumulate tokens
    if (entry) {
      this.agentTotals.inputTokens += entry.agentInputTokens - entry.lastReportedInputTokens;
      this.agentTotals.outputTokens += entry.agentOutputTokens - entry.lastReportedOutputTokens;
      this.agentTotals.totalTokens += entry.agentTotalTokens - entry.lastReportedTotalTokens;
    }

    if (result.success) {
      if (result.needsContinuation) {
        // Schedule continuation retry
        this.retryManager.scheduleContinuation(
          issueId,
          entry?.identifier ?? issueId,
          result.turnCount,
        );
      } else {
        this.completed.add(issueId);
        this.claimed.delete(issueId);

        // Transition issue to terminal state so the tracker stops returning it
        const terminalState = this.config.tracker.terminal_states[0] ?? 'done';
        this.tracker.transitionIssue?.(issueId, terminalState).catch((err) => {
          warn('orchestrator:transition-failed', {
            issueId,
            error: err instanceof Error ? err.message : String(err),
          });
        });

        info('orchestrator:completed', { issueId });
      }
    } else {
      // Schedule failure retry
      const attempt = entry?.retryAttempt ?? 0;

      if (attempt >= this.config.agent.max_retries) {
        // Max retries exhausted — transition to failed
        this.claimed.delete(issueId);
        const failedState = this.config.tracker.terminal_states[1] ?? 'failed';
        this.tracker.transitionIssue?.(issueId, failedState).catch((err) => {
          warn('orchestrator:transition-failed', {
            issueId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
        info('orchestrator:exhausted-retries', { issueId, attempt });
      } else {
        this.retryManager.scheduleRetry(
          issueId,
          entry?.identifier ?? issueId,
          attempt,
          result.error,
        );
      }
    }

    this.emitState();
  }

  private onRunUpdate(issueId: string, updates: Partial<RunningEntry>): void {
    const entry = this.running.get(issueId);
    if (!entry) return;
    Object.assign(entry, updates);

    // Debounced state emission — collapse rapid updates into one write every 2s
    if (!this.debouncedEmitTimer) {
      this.debouncedEmitTimer = setTimeout(() => {
        this.debouncedEmitTimer = null;
        this.emitState();
      }, 2_000);
    }
  }

  // ── Other handlers ───────────────────────────────────────────

  private killRun(issueId: string, reason: string): void {
    const runner = this.runners.get(issueId);
    if (runner) {
      runner.kill();
    }
    this.running.delete(issueId);
    this.runners.delete(issueId);
    this.claimed.delete(issueId);
    info('orchestrator:killed', { issueId, reason });
  }

  private updateIssueState(issueId: string, newState: string): void {
    const entry = this.running.get(issueId);
    if (entry) {
      entry.issue = { ...entry.issue, state: newState };
    }
  }

  private handleRetry(issueId: string, attempt: number): void {
    if (!this.active) return;

    // Re-fetch the issue and dispatch
    this.tracker
      .fetchCandidateIssues()
      .then((candidates) => {
        const issue = candidates.find((c) => c.id === issueId);
        if (!issue) {
          this.claimed.delete(issueId);
          warn('orchestrator:retry-issue-gone', { issueId });
          return;
        }

        dispatchWorker(
          issue,
          this.promptTemplate,
          this.config,
          this.workspaceManager,
          {
            onRunStarted: (entry, runner) => this.onRunStarted(entry, runner),
            onRunFinished: (id, result) => this.onRunFinished(id, result),
            onRunUpdate: (id, updates) => this.onRunUpdate(id, updates),
          },
          attempt,
        ).catch(() => {});
      })
      .catch((err) => {
        this.claimed.delete(issueId);
        logError('orchestrator:retry-fetch-failed', {
          issueId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }

  private emitState(): void {
    if (!this.onStateChange) return;
    try {
      this.onStateChange(this.getState());
    } catch {
      // state callback errors must not crash the orchestrator
    }
  }
}
