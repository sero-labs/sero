/**
 * Local copies of the cron plugin types needed by automation-state.ts.
 *
 * These mirror the shapes from sero-cron-plugin/shared/types.ts but are
 * owned by the memory plugin so there's no cross-plugin import coupling.
 * If the cron plugin's schema evolves, update these types and the
 * read/write logic in automation-state.ts.
 */

export interface CronJob {
  name: string;
  schedule: string;
  prompt: string;
  channel: string;
  disabled: boolean;
  runIfMissed?: boolean;
}

export interface CronState {
  jobs: CronJob[];
  reminders: unknown[];
  schedulerActive: boolean;
  autostart: boolean;
  lastRunResults: unknown[];
}

export const DEFAULT_CRON_STATE: CronState = {
  jobs: [],
  reminders: [],
  schedulerActive: false,
  autostart: false,
  lastRunResults: [],
};
