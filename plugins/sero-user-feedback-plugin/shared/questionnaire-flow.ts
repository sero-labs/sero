import type { QuestionAnswer, QuestionItem, QuestionOption } from './types';

export type AnswerMap = Map<string, QuestionAnswer[]>;

export function getQuestionAnswers(
  answers: ReadonlyMap<string, QuestionAnswer[]>,
  questionId: string,
): QuestionAnswer[] {
  return answers.get(questionId) ?? [];
}

export function hasQuestionAnswer(
  answers: ReadonlyMap<string, QuestionAnswer[]>,
  questionId: string,
): boolean {
  return getQuestionAnswers(answers, questionId).length > 0;
}

export function getCustomAnswer(
  answers: QuestionAnswer[],
): QuestionAnswer | undefined {
  return answers.find((answer) => answer.wasCustom);
}

export function getOptionByValue(
  question: QuestionItem,
  value: string,
): QuestionOption | undefined {
  return question.options.find((option) => option.value === value);
}

export function updateQuestionAnswers(
  answers: ReadonlyMap<string, QuestionAnswer[]>,
  questionId: string,
  nextAnswers: QuestionAnswer[],
): AnswerMap {
  const next = new Map(answers);
  if (nextAnswers.length === 0) {
    next.delete(questionId);
    return next;
  }

  next.set(questionId, nextAnswers);
  return next;
}

export function selectQuestionOption(
  question: QuestionItem,
  option: QuestionOption,
  optionIndex: number,
  currentAnswers: QuestionAnswer[],
): QuestionAnswer[] {
  const nextAnswer: QuestionAnswer = {
    questionId: question.id,
    value: option.value,
    label: option.label,
    wasCustom: false,
    index: optionIndex + 1,
  };

  if (question.multiSelect !== true) {
    return [nextAnswer];
  }

  const isSelected = currentAnswers.some(
    (answer) => !answer.wasCustom && answer.value === option.value,
  );
  if (isSelected) {
    return currentAnswers.filter(
      (answer) => answer.wasCustom || answer.value !== option.value,
    );
  }

  if (option.exclusive) {
    return [nextAnswer];
  }

  return [
    ...currentAnswers.filter((answer) => {
      if (answer.wasCustom) return true;
      return !getOptionByValue(question, answer.value)?.exclusive;
    }),
    nextAnswer,
  ];
}

export function submitCustomQuestionAnswer(
  question: QuestionItem,
  currentAnswers: QuestionAnswer[],
  text: string,
): QuestionAnswer[] {
  const customAnswer: QuestionAnswer = {
    questionId: question.id,
    value: text,
    label: text,
    wasCustom: true,
  };

  if (question.multiSelect !== true) {
    return [customAnswer];
  }

  return [
    ...currentAnswers.filter((answer) => {
      if (answer.wasCustom) return false;
      return !getOptionByValue(question, answer.value)?.exclusive;
    }),
    customAnswer,
  ];
}

export function removeCustomQuestionAnswer(
  currentAnswers: QuestionAnswer[],
): QuestionAnswer[] {
  return currentAnswers.filter((answer) => !answer.wasCustom);
}

export function flattenQuestionnaireAnswers(
  questions: QuestionItem[],
  answers: ReadonlyMap<string, QuestionAnswer[]>,
): QuestionAnswer[] {
  return questions.flatMap((question) => getQuestionAnswers(answers, question.id));
}

export function canSubmitQuestionnaire(
  questions: QuestionItem[],
  answers: ReadonlyMap<string, QuestionAnswer[]>,
): boolean {
  return flattenQuestionnaireAnswers(questions, answers).length > 0;
}

export function formatQuestionnaireAnswerLabel(answer: QuestionAnswer): string {
  return answer.wasCustom ? `✎ ${answer.label}` : `${answer.index}. ${answer.label}`;
}
