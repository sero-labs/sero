import type { UserFeedbackOpenTarget, UserFeedbackQuestionContext } from './user-feedback';

export type AppRuntimeNotificationType = 'info' | 'warning' | 'error';

export interface AppRuntimeNotificationOptions {
  message: string;
  type?: AppRuntimeNotificationType;
  source?: string;
  sound?: string | boolean;
  subtitle?: string;
}

export interface AppRuntimeNotificationChoice {
  id: string;
  label: string;
  description?: string;
  menu?: string;
  emphasis?: 'primary';
}

export interface AppRuntimeNotificationChoiceResult {
  choiceId: string | null;
  timedOut: boolean;
}

export interface AppRuntimeNotificationChoiceOptions {
  title: string;
  body: string;
  choices: AppRuntimeNotificationChoice[];
  timeoutMs: number;
  context?: UserFeedbackQuestionContext;
  openTarget?: UserFeedbackOpenTarget;
  fallbackLabel?: string;
}

export interface AppRuntimeNotificationsApi {
  notify(options: AppRuntimeNotificationOptions): void;
  /** Resolves with the chosen id, or `timedOut: true` after `timeoutMs`. */
  requestChoice(options: AppRuntimeNotificationChoiceOptions): Promise<AppRuntimeNotificationChoiceResult>;
}
