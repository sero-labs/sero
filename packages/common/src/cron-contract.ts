export interface CronJob {
  name: string;
  schedule: string;
  prompt: string;
  channel: string;
  disabled: boolean;
  model?: string;
  runIfMissed?: boolean;
}

export interface CronState<
  TReminder = unknown,
  TRunResult = unknown,
  TNotificationSettings = unknown,
> {
  jobs: CronJob[];
  reminders: TReminder[];
  schedulerActive: boolean;
  autostart: boolean;
  lastTickMinute?: string;
  lastSchedulerShutdown?: string;
  lastRunResults: TRunResult[];
  notificationSettings?: TNotificationSettings;
}
