/**
 * Shared state shape for the Cron app.
 *
 * Single source of truth — both the Pi extension and the Sero web UI
 * read/write a JSON file matching this shape.
 *
 * Global-scoped: state lives at ~/.sero-ui/apps/cron/state.json
 * (shared across all workspaces).
 */

export interface CronJob {
  name: string;
  /** 5-field cron expression: min hour dom month dow */
  schedule: string;
  /** Prompt sent to the agent when the job fires */
  prompt: string;
  /** Grouping tag (default: "cron") */
  channel: string;
  /** Whether the job is disabled (won't execute on schedule) */
  disabled: boolean;
  /**
   * Model pattern or ID (e.g. "sonnet", "openai/gpt-4o", "gemini:high").
   * Supports "provider/id" shorthand and optional ":<thinking>" suffix.
   * When unset, the job uses whatever default is in your Pi settings.
   */
  model?: string;
}

export interface CronRunResult {
  jobName: string;
  startedAt: string; // ISO string
  durationMs: number;
  ok: boolean;
  error?: string;
}

export interface CronState {
  jobs: CronJob[];
  schedulerActive: boolean;
  /** Start the scheduler automatically when Sero launches */
  autostart: boolean;
  /** Recent execution results (capped at 50) */
  lastRunResults: CronRunResult[];
}

export const DEFAULT_CRON_STATE: CronState = {
  jobs: [],
  schedulerActive: false,
  autostart: false,
  lastRunResults: [],
};

/** Maximum number of run results to keep */
export const MAX_RUN_RESULTS = 50;
