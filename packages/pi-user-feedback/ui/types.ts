/**
 * Re-export shared types for the UI.
 *
 * The UI can't import from `@/types/ipc` (that's host-side). Instead
 * it uses the shared types from the package, re-aliased here to match
 * the names used in the host's IPC types.
 */

export type {
  PendingQuestion as UserFeedbackPendingQuestion,
  QuestionItem as UserFeedbackQuestionItem,
  QuestionOption as UserFeedbackQuestionOption,
  QuestionAnswer as UserFeedbackAnswer,
  QuestionResponse as UserFeedbackResponse,
} from '../shared/types';
