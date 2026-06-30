/**
 * Shared draft-answer logic for the human-input cards (the loop detail's
 * InputRequestCard and the home inbox's AttentionInputCard). One question can be
 * answered by a quick-pick choice and/or free text; all questions in a request
 * are submitted at once via the `answer_input` action.
 */

import type { HumanQuestion, InputAnswer } from '../../shared/types';

export type AnswerDraft = Record<string, { choiceId?: string; text: string }>;

export function isAnswered(q: HumanQuestion, draft: AnswerDraft): boolean {
  const d = draft[q.id];
  return Boolean(d && (d.choiceId || d.text.trim()));
}

export function allAnswered(questions: HumanQuestion[], draft: AnswerDraft): boolean {
  return questions.every((q) => isAnswered(q, draft));
}

/** Toggle a choice (re-clicking clears it), preserving any typed text. */
export function withChoice(draft: AnswerDraft, qid: string, choiceId: string): AnswerDraft {
  return { ...draft, [qid]: { choiceId: draft[qid]?.choiceId === choiceId ? undefined : choiceId, text: draft[qid]?.text ?? '' } };
}

export function withText(draft: AnswerDraft, qid: string, text: string): AnswerDraft {
  return { ...draft, [qid]: { choiceId: draft[qid]?.choiceId, text } };
}

export function buildAnswers(questions: HumanQuestion[], draft: AnswerDraft): InputAnswer[] {
  return questions.map((q) => {
    const d = draft[q.id];
    const text = d?.text.trim();
    return { questionId: q.id, ...(d?.choiceId ? { choiceId: d.choiceId } : {}), ...(text ? { text } : {}) };
  });
}
