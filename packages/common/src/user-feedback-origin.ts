import { getGlobalSingleton, type UserFeedbackQuestionContext, type UserFeedbackOpenTarget } from './user-feedback';

/** Display provenance registered by the host for a session it actually opened. Never authority. */
export interface UserFeedbackOrigin {
  context: UserFeedbackQuestionContext;
  openTarget?: UserFeedbackOpenTarget;
}

const origins = () => getGlobalSingleton('__seroUserFeedbackOrigins', () => new Map<string, UserFeedbackOrigin>());

export function registerUserFeedbackOrigin(sessionPath: string, origin: UserFeedbackOrigin): void {
  origins().set(sessionPath, origin);
}

export function removeUserFeedbackOrigin(sessionPath: string): void {
  origins().delete(sessionPath);
}

export function userFeedbackOrigin(sessionPath: string | undefined): UserFeedbackOrigin | undefined {
  return sessionPath ? origins().get(sessionPath) : undefined;
}
