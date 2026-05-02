import type {
  UserFeedbackQuestionOption,
  UserFeedbackPendingQuestion,
  UserFeedbackQuestionItem,
  UserFeedbackAnswer,
  UserFeedbackResponse,
} from '@sero-ai/common';

export type QuestionOption = UserFeedbackQuestionOption;
export type PendingQuestion = UserFeedbackPendingQuestion;
export type QuestionItem = UserFeedbackQuestionItem;
export type QuestionAnswer = UserFeedbackAnswer;
export type QuestionResponse = UserFeedbackResponse;

export interface UserFeedbackState {
  lastActivity?: string;
}

export const DEFAULT_STATE: UserFeedbackState = {};
