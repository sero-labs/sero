/**
 * Human-input types — a durable question a step or the planner can raise that
 * parks the loop until the user answers. See specs/07-human-input.md.
 *
 * Split from types.ts (500-LOC limit) and re-exported there so existing imports
 * keep resolving. These types have no dependency on ./types, so there is no
 * import cycle.
 */

/** An optional quick-pick option offered alongside a free-text answer. */
export interface HumanChoice {
  id: string;
  label: string;
}

/**
 * One question put to the user. `choices` are optional quick-picks; free text is
 * always allowed too, so a question can be a yes/no, a pick-one, or open-ended.
 */
export interface HumanQuestion {
  id: string;
  prompt: string;
  choices?: HumanChoice[];
}

/**
 * A durable request for human input. While set on a loop's runtime the loop is
 * parked: no steps start and scheduled fires hold off until it is answered. There
 * is never a timeout or default — a human gate only clears when the human answers.
 */
export interface PendingInput {
  id: string;
  /** Who raised it: the planner (at create time) or a running step. */
  source: 'planner' | 'step';
  /** The step that asked (source === 'step'). */
  stepId?: string;
  questions: HumanQuestion[];
  askedAt: string;
}

/** One answer to one question: a picked choice id and/or free text. */
export interface InputAnswer {
  questionId: string;
  choiceId?: string;
  text?: string;
}

/**
 * A resolved input request, kept on the loop for history and (for step
 * questions) fed back into the asking step's next attempt as context.
 */
export interface AnsweredInput {
  requestId: string;
  source: 'planner' | 'step';
  stepId?: string;
  questions: HumanQuestion[];
  answers: InputAnswer[];
  answeredAt: string;
}

/**
 * When the prompt is missing essential information, the planner may reply with
 * questions instead of a plan. The loop is created as a draft parked on these
 * questions; answering them re-runs the planner.
 */
export interface ClarifyingResponse {
  clarifyingQuestions: HumanQuestion[];
}
