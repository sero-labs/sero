export type UserFeedbackQuestionType =
  | 'question'
  | 'questionnaire'
  | 'interview'
  | 'permission';

export interface UserFeedbackQuestionOption {
  value: string;
  label: string;
  description?: string;
  exclusive?: boolean;
}

export interface UserFeedbackQuestionItem {
  id: string;
  label: string;
  prompt: string;
  options: UserFeedbackQuestionOption[];
  allowOther: boolean;
  multiSelect?: boolean;
}

/** Sent from main → renderer when a question/questionnaire/interview/permission tool starts. */
export interface UserFeedbackPendingQuestion {
  id: string;
  type: UserFeedbackQuestionType;
  toolCallId: string;
  questions: UserFeedbackQuestionItem[];
  timestamp: string;
}

export interface UserFeedbackAnswer {
  questionId: string;
  value: string;
  label: string;
  wasCustom: boolean;
  index?: number;
}

/** Sent from renderer → main when the user answers or cancels. */
export interface UserFeedbackResponse {
  id: string;
  answers: UserFeedbackAnswer[];
  cancelled: boolean;
}

export interface UserFeedbackCancelPayload {
  id: string;
}

export const USER_FEEDBACK_BUS_KEY = '__seroUserFeedbackBus';
export const USER_FEEDBACK_QUESTION_REQUEST_EVENT = 'question-request';
export const USER_FEEDBACK_QUESTION_CANCEL_EVENT = 'question-cancel';

export function getGlobalSingleton<T>(key: string, create: () => T): T {
  const globalRecord = globalThis as Record<string, unknown>;
  const existing = globalRecord[key];
  if (existing !== undefined) {
    return existing as T;
  }

  const value = create();
  globalRecord[key] = value;
  return value;
}

export function getUserFeedbackAnswerEvent(id: string): `answer:${string}` {
  return `answer:${id}`;
}
