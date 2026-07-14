// Desktop-owned response feedback persistence contracts plus compatibility re-exports
// for canonical user-feedback transport types from @sero-ai/common.
// This module stays separate from ipc.ts to keep contract files below size caps.

/** A single user feedback entry for an agent response. */
export interface ResponseFeedbackEntry {
  /** The assistant message ID this feedback is for. */
  messageId: string;
  /** Session ID where the response occurred. */
  sessionId: string;
  /** 'good' or 'bad' rating. */
  rating: 'good' | 'bad';
  /** ISO timestamp when feedback was submitted. */
  timestamp: string;
  /** First ~300 chars of the user prompt that preceded this response. */
  promptExcerpt?: string;
  /** First ~300 chars of the assistant response. */
  responseExcerpt?: string;
  /** Optional free-text note from the user. */
  note?: string;
}

/** Full feedback state persisted to disk. */
export interface ResponseFeedbackState {
  entries: ResponseFeedbackEntry[];
}

export type {
  UserFeedbackQuestionOption,
  UserFeedbackQuestionContext,
  UserFeedbackOpenTarget,
  UserFeedbackQuestionItem,
  UserFeedbackPendingQuestion,
  UserFeedbackAnswer,
  UserFeedbackResponse,
  UserFeedbackCancelPayload,
} from '@sero-ai/common';
