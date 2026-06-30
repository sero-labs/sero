import { describe, expect, it } from 'vitest';
import { allAnswered, buildAnswers, withChoice, withText, type AnswerDraft } from '../lib/answer-draft';
import type { HumanQuestion } from '../../shared/types';

const QUESTIONS: HumanQuestion[] = [
  { id: 'q1', prompt: 'Pick one', choices: [{ id: 'c1', label: 'A' }, { id: 'c2', label: 'B' }] },
  { id: 'q2', prompt: 'Free text' },
];

describe('answer-draft', () => {
  it('treats a question as answered by a choice or by text', () => {
    let draft: AnswerDraft = {};
    expect(allAnswered(QUESTIONS, draft)).toBe(false);
    draft = withChoice(draft, 'q1', 'c1');
    draft = withText(draft, 'q2', 'hello');
    expect(allAnswered(QUESTIONS, draft)).toBe(true);
  });

  it('toggles a choice off when re-picked, preserving typed text', () => {
    let draft = withText({}, 'q1', 'typed');
    draft = withChoice(draft, 'q1', 'c1');
    expect(draft.q1.choiceId).toBe('c1');
    draft = withChoice(draft, 'q1', 'c1');
    expect(draft.q1.choiceId).toBeUndefined();
    expect(draft.q1.text).toBe('typed');
  });

  it('builds answers with only the fields the user supplied', () => {
    let draft = withChoice({}, 'q1', 'c2');
    draft = withText(draft, 'q2', '  spaced  ');
    expect(buildAnswers(QUESTIONS, draft)).toEqual([
      { questionId: 'q1', choiceId: 'c2' },
      { questionId: 'q2', text: 'spaced' },
    ]);
  });
});
