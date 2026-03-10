/**
 * Active run reconciliation — stall detection + tracker state refresh.
 *
 * Part A: Check elapsed since last event, kill if > stall_timeout_ms.
 * Part B: Fetch current states from tracker, stop terminal/non-active runs.
 */

import type { RunningEntry, SymphonyConfig } from '../shared/types';
import type { IssueTracker } from './tracker';
import { info, warn } from './logger';

// ── Types ──────────────────────────────────────────────────────

export interface ReconcileCallbacks {
  /** Kill a running agent and mark it as stalled. */
  killRun: (issueId: string, reason: string) => void;
  /** Update the in-memory issue snapshot for an active run. */
  updateIssueState: (issueId: string, newState: string) => void;
}

// ── Reconciler ─────────────────────────────────────────────────

export class Reconciler {
  private config: SymphonyConfig;
  private tracker: IssueTracker;
  private callbacks: ReconcileCallbacks;

  constructor(
    config: SymphonyConfig,
    tracker: IssueTracker,
    callbacks: ReconcileCallbacks,
  ) {
    this.config = config;
    this.tracker = tracker;
    this.callbacks = callbacks;
  }

  /** Run full reconciliation: stall detection + state refresh. */
  async reconcile(running: RunningEntry[]): Promise<void> {
    if (running.length === 0) return;

    this.detectStalls(running);
    await this.refreshStates(running);
  }

  // ── Part A: Stall detection ────────────────────────────────

  private detectStalls(running: RunningEntry[]): void {
    const now = Date.now();
    const stallTimeoutMs = this.config.polling.stall_timeout_ms;

    for (const entry of running) {
      const lastActivity = entry.lastCodexTimestamp
        ? new Date(entry.lastCodexTimestamp).getTime()
        : new Date(entry.startedAt).getTime();

      const elapsed = now - lastActivity;

      if (elapsed > stallTimeoutMs) {
        warn('reconciler:stall-detected', {
          issueId: entry.issueId,
          identifier: entry.identifier,
          elapsedMs: elapsed,
          stallTimeoutMs,
        });
        this.callbacks.killRun(entry.issueId, 'stalled');
      }
    }
  }

  // ── Part B: Tracker state refresh ──────────────────────────

  private async refreshStates(running: RunningEntry[]): Promise<void> {
    const ids = running.map((r) => r.issueId);

    let states: Map<string, string>;
    try {
      states = await this.tracker.fetchIssueStatesByIds(ids);
    } catch (err) {
      warn('reconciler:refresh-failed', {
        error: err instanceof Error ? err.message : String(err),
        hint: 'Keeping workers alive, will retry next tick',
      });
      return;
    }

    const activeStates = new Set(this.config.tracker.active_states);
    const terminalStates = new Set(this.config.tracker.terminal_states);

    for (const entry of running) {
      const currentState = states.get(entry.issueId);
      if (!currentState) continue;

      if (terminalStates.has(currentState)) {
        info('reconciler:terminal-state', {
          issueId: entry.issueId,
          state: currentState,
        });
        this.callbacks.killRun(entry.issueId, `terminal_state:${currentState}`);
      } else if (!activeStates.has(currentState)) {
        info('reconciler:non-active-state', {
          issueId: entry.issueId,
          state: currentState,
        });
        this.callbacks.killRun(entry.issueId, `non_active_state:${currentState}`);
      } else {
        // Still active — update snapshot
        this.callbacks.updateIssueState(entry.issueId, currentState);
      }
    }
  }

  /** Update tracker reference (e.g., after config reload). */
  setTracker(tracker: IssueTracker): void {
    this.tracker = tracker;
  }

  /** Update config (e.g., after WORKFLOW.md reload). */
  setConfig(config: SymphonyConfig): void {
    this.config = config;
  }
}
