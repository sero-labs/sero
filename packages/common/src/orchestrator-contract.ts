/**
 * Cross-plugin contract for the Orchestrator's scheduled loops.
 *
 * The Orchestrator app (workspace-scoped) maintains a small watched loop index;
 * other surfaces — currently the Scheduler (cron) app — read that index to list
 * scheduled loops, deep-link back into the Orchestrator, and edit a loop's
 * schedule through the `orchestrator` tool. Keeping the shared shapes here makes
 * producer/consumer drift a typecheck error instead of a runtime mismatch.
 */

export const ORCHESTRATOR_APP_ID = 'orchestrator';

/** The Orchestrator's watched loop index, relative to the workspace root. */
export const ORCHESTRATOR_INDEX_FILE = '.sero/apps/orchestrator/index.json';

export type OrchestratorLoopStatus = 'draft' | 'active' | 'blocked' | 'complete' | 'disabled';

/** Compact view of one scheduled (cron/hybrid) trigger, embedded in the loop index. */
export interface OrchestratorScheduleSummary {
  triggerId: string;
  /** 'cron' fires purely on schedule; 'hybrid' also fires on events. */
  type: 'cron' | 'hybrid';
  /** 5-field cron expression (minute hour dom month dow), evaluated in UTC. */
  schedule: string;
  /** ISO timestamp of the next scheduled fire (absent when paused or exhausted). */
  nextFireAt?: string;
  lastFireAt?: string;
  /**
   * True when the user paused the cron schedule (resumable). A hybrid trigger
   * still fires on its events while paused — only the schedule is stopped.
   */
  paused?: boolean;
  /**
   * True when the trigger hit its declared run limit (maxFires) — it will not
   * fire again and can't be resumed; the loop must be restarted in Orchestrator.
   */
  exhausted?: boolean;
}

/** The subset of a loop-index entry that external surfaces rely on. */
export interface OrchestratorScheduledLoopView {
  id: string;
  title: string;
  status: OrchestratorLoopStatus;
  /** Present only when the loop has cron/hybrid triggers carrying a schedule. */
  schedules?: OrchestratorScheduleSummary[];
  /** A user-delayed run will retry at this durable timestamp. */
  snoozedUntil?: string;
  updatedAt: string;
}

/** The watched index file shape (the externally consumed subset). */
export interface OrchestratorIndexView {
  loops: OrchestratorScheduledLoopView[];
}

/** Flat params for the `orchestrator` tool's `set_schedule` action (cross-app schedule edits). */
export interface OrchestratorSetScheduleParams {
  action: 'set_schedule';
  loopId: string;
  triggerId: string;
  /** New 5-field cron expression (UTC). Omit to keep the current one. */
  schedule?: string;
  /** Pause (true) or resume (false) the schedule. Omit to keep the current state. */
  scheduleDisabled?: boolean;
}
