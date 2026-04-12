// Source of truth for user feedback contracts used across renderer + Electron IPC.
// This module is intentionally separate from ipc.ts to keep contract files below size caps.

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
  type: 'question' | 'questionnaire' | 'interview' | 'permission';
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
