import type { ElicitResult } from '@modelcontextprotocol/client';
import type { UserFeedbackAnswer, UserFeedbackQuestionItem } from '@sero-ai/common';
import { buildFormQuestions, parseFormAnswers } from './form-questionnaire';

/** Shows questions to the user. Resolves with the answers, or `null` when the user cancels. */
export type AskQuestions = (questions: UserFeedbackQuestionItem[]) => Promise<UserFeedbackAnswer[] | null>;

export interface FormAnswer {
  result: ElicitResult;
  /** Set when Sero declined without asking, with the reason for the user. */
  notice?: string;
}

/**
 * Asks the user to fill in an MCP form. A bad value is asked again once with
 * the reason; a second bad value declines the request.
 */
export async function answerFormRequest(
  request: { message: string; requestedSchema: unknown },
  serverLabel: string,
  ask: AskQuestions,
): Promise<FormAnswer> {
  const built = buildFormQuestions(request.message, request.requestedSchema, serverLabel);
  if (!built.ok) {
    return { result: { action: 'decline' }, notice: `Sero declined a request from ${serverLabel}. ${built.reason}` };
  }

  let questions = built.questions;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const answers = await ask(questions);
    if (answers === null) return { result: { action: 'cancel' } };
    const parsed = parseFormAnswers(built.fields, answers);
    if (parsed.kind === 'accept') return { result: { action: 'accept', content: parsed.content } };
    if (parsed.kind === 'decline') return { result: { action: 'decline' } };
    questions = built.questions.map((question, index) => (index === 0
      ? { ...question, prompt: `${parsed.error} Answer again.\n\n${question.prompt}` }
      : question));
  }
  return { result: { action: 'decline' }, notice: `Sero declined a request from ${serverLabel} after two answers that did not fit the form.` };
}
