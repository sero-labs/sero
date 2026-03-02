/**
 * Shared types for the user-feedback extension.
 *
 * Used by both the Pi extension (main process) and the web UI (renderer).
 * Must be JSON-serialisable.
 */

// ── Question option ────────────────────────────────────────────

export interface QuestionOption {
  value: string;
  label: string;
  description?: string;
}

// ── Pending question (sent from extension → renderer) ──────────

export interface PendingQuestion {
  /** Unique ID for this question request. */
  id: string;
  /** Which tool triggered this: 'question', 'questionnaire', 'interview', or 'permission'. */
  type: 'question' | 'questionnaire' | 'interview' | 'permission';
  /** The tool call ID (for correlating with chat tool displays). */
  toolCallId: string;
  /** One or more questions to ask. */
  questions: QuestionItem[];
  /** ISO timestamp when the question was created. */
  timestamp: string;
}

export interface QuestionItem {
  /** Unique ID within the questionnaire (or 'q0' for single questions). */
  id: string;
  /** Short label for tab/step display (e.g. 'Scope', 'Priority'). */
  label: string;
  /** Full question text to display. */
  prompt: string;
  /** Available options. */
  options: QuestionOption[];
  /** Whether to show a "Type something…" custom input option. */
  allowOther: boolean;
}

// ── Answer (sent from renderer → extension) ────────────────────

export interface QuestionAnswer {
  /** Matches QuestionItem.id */
  questionId: string;
  /** The selected value. */
  value: string;
  /** Display label for the answer. */
  label: string;
  /** True if the user typed a custom response. */
  wasCustom: boolean;
  /** 1-based index of the selected option (undefined for custom). */
  index?: number;
}

// ── Response (full response for a PendingQuestion) ─────────────

export interface QuestionResponse {
  /** Matches PendingQuestion.id */
  id: string;
  /** Answers for each question. */
  answers: QuestionAnswer[];
  /** True if the user cancelled. */
  cancelled: boolean;
}

// ── App state (minimal — just for Sero app discovery) ──────────

export interface UserFeedbackState {
  lastActivity?: string;
}

export const DEFAULT_STATE: UserFeedbackState = {};
