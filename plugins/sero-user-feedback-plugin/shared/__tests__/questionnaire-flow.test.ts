import { describe, expect, it } from 'vitest';

import {
  canSubmitQuestionnaire,
  flattenQuestionnaireAnswers,
  formatQuestionnaireAnswerLabel,
  hasQuestionAnswerDeep,
  selectQuestionOption,
  submitCustomQuestionAnswer,
} from '../questionnaire-flow';
import type { QuestionAnswer, QuestionItem } from '../types';

const singleQuestion: QuestionItem = {
  id: 'q1',
  label: 'Question 1',
  prompt: 'Choose one option',
  options: [
    { value: 'one', label: 'One' },
    { value: 'two', label: 'Two' },
  ],
  allowOther: true,
};

const multiQuestion: QuestionItem = {
  id: 'q2',
  label: 'Question 2',
  prompt: 'Choose several options',
  options: [
    { value: 'alpha', label: 'Alpha' },
    { value: 'beta', label: 'Beta' },
    { value: 'none', label: 'None', exclusive: true },
  ],
  allowOther: true,
  multiSelect: true,
};

describe('questionnaire flow helpers', () => {
  it('allows questionnaire submission once any answer exists and preserves question order', () => {
    const answers = new Map<string, QuestionAnswer[]>([
      [multiQuestion.id, [{ questionId: multiQuestion.id, value: 'beta', label: 'Beta', wasCustom: false, index: 2 }]],
    ]);

    expect(canSubmitQuestionnaire([singleQuestion, multiQuestion], answers)).toBe(true);
    expect(flattenQuestionnaireAnswers([singleQuestion, multiQuestion], answers)).toEqual([
      { questionId: multiQuestion.id, value: 'beta', label: 'Beta', wasCustom: false, index: 2 },
    ]);
  });

  it('toggles multi-select options and enforces exclusive choices', () => {
    const alpha = selectQuestionOption(multiQuestion, multiQuestion.options[0], 0, []);
    expect(alpha).toEqual([
      { questionId: multiQuestion.id, value: 'alpha', label: 'Alpha', wasCustom: false, index: 1 },
    ]);

    const alphaAndBeta = selectQuestionOption(
      multiQuestion,
      multiQuestion.options[1],
      1,
      alpha,
    );
    expect(alphaAndBeta).toEqual([
      { questionId: multiQuestion.id, value: 'alpha', label: 'Alpha', wasCustom: false, index: 1 },
      { questionId: multiQuestion.id, value: 'beta', label: 'Beta', wasCustom: false, index: 2 },
    ]);

    const noneOnly = selectQuestionOption(
      multiQuestion,
      multiQuestion.options[2],
      2,
      alphaAndBeta,
    );
    expect(noneOnly).toEqual([
      { questionId: multiQuestion.id, value: 'none', label: 'None', wasCustom: false, index: 3 },
    ]);

    const betaOnly = selectQuestionOption(
      multiQuestion,
      multiQuestion.options[1],
      1,
      noneOnly,
    );
    expect(betaOnly).toEqual([
      { questionId: multiQuestion.id, value: 'beta', label: 'Beta', wasCustom: false, index: 2 },
    ]);

    expect(
      selectQuestionOption(multiQuestion, multiQuestion.options[1], 1, betaOnly),
    ).toEqual([]);
  });

  it('replaces exclusive answers with one custom answer in multi-select mode', () => {
    const nextAnswers = submitCustomQuestionAnswer(
      multiQuestion,
      [
        { questionId: multiQuestion.id, value: 'none', label: 'None', wasCustom: false, index: 3 },
        { questionId: multiQuestion.id, value: 'old', label: 'Old note', wasCustom: true },
      ],
      'New note',
    );

    expect(nextAnswers).toEqual([
      { questionId: multiQuestion.id, value: 'New note', label: 'New note', wasCustom: true },
    ]);
  });

  it('formats review labels for option and custom answers', () => {
    expect(
      formatQuestionnaireAnswerLabel({
        questionId: singleQuestion.id,
        value: 'one',
        label: 'One',
        wasCustom: false,
        index: 1,
      }),
    ).toBe('1. One');
    expect(
      formatQuestionnaireAnswerLabel({
        questionId: singleQuestion.id,
        value: 'custom',
        label: 'Custom answer',
        wasCustom: true,
      }),
    ).toBe('✎ Custom answer');
  });

  it('requires selected sub-question answers and flattens them under their parent', () => {
    const nestedQuestion: QuestionItem = {
      ...singleQuestion,
      options: [{
        value: 'one',
        label: 'One',
        subQuestion: {
          id: 'depth',
          label: 'Depth',
          prompt: 'Pick depth',
          options: [{ value: 'full', label: 'Full' }],
          allowOther: false,
        },
      }],
    };
    const parentAnswer = selectQuestionOption(nestedQuestion, nestedQuestion.options[0], 0, []);
    const answers = new Map<string, QuestionAnswer[]>([[nestedQuestion.id, parentAnswer]]);

    expect(hasQuestionAnswerDeep(answers, nestedQuestion)).toBe(false);

    const subQuestion = nestedQuestion.options[0].subQuestion!;
    answers.set(subQuestion.id, selectQuestionOption(subQuestion, subQuestion.options[0], 0, []));

    expect(hasQuestionAnswerDeep(answers, nestedQuestion)).toBe(true);
    expect(flattenQuestionnaireAnswers([nestedQuestion], answers).map((answer) => answer.questionId)).toEqual([
      'q1',
      'depth',
    ]);
  });
});
