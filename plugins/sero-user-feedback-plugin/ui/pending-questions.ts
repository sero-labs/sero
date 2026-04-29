import type { UserFeedbackPendingQuestion } from './types';

export function isMultiStepQuestion(question: UserFeedbackPendingQuestion): boolean {
  return question.type === 'questionnaire' || question.type === 'interview';
}

export function getMultiStepPendingQuestions(
  questions: UserFeedbackPendingQuestion[],
): UserFeedbackPendingQuestion[] {
  return questions.filter(isMultiStepQuestion);
}

export function upsertPendingQuestion(
  pendingQuestions: UserFeedbackPendingQuestion[],
  question: UserFeedbackPendingQuestion,
): UserFeedbackPendingQuestion[] {
  if (!isMultiStepQuestion(question)) return pendingQuestions;

  const existingIndex = pendingQuestions.findIndex((item) => item.id === question.id);
  if (existingIndex === -1) {
    return [...pendingQuestions, question];
  }

  const next = [...pendingQuestions];
  next[existingIndex] = question;
  return next;
}

export function removePendingQuestion(
  pendingQuestions: UserFeedbackPendingQuestion[],
  id: string,
): UserFeedbackPendingQuestion[] {
  const existingIndex = pendingQuestions.findIndex((item) => item.id === id);
  if (existingIndex === -1) return pendingQuestions;

  const next = [...pendingQuestions];
  next.splice(existingIndex, 1);
  return next;
}
