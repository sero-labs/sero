/**
 * Neutral cron persistence contract shared with the cron plugin.
 */

import type { CronState } from '@sero-ai/common';

export type { CronJob, CronState } from '@sero-ai/common';

export const DEFAULT_CRON_STATE: CronState = {
  jobs: [],
  reminders: [],
  schedulerActive: false,
  autostart: false,
  lastRunResults: [],
};
