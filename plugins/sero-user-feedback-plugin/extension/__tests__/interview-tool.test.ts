import { describe, expect, it } from 'vitest';

import { buildInterviewResult } from '../interview-tool';
import type { QuestionAnswer, QuestionItem } from '../../shared/types';

const questions: QuestionItem[] = [
  {
    id: 'q1',
    label: 'Q1',
    prompt: 'What should this feature do?',
    options: [],
    allowOther: true,
  },
  {
    id: 'q2',
    label: 'Q2',
    prompt: 'What edge cases matter?',
    options: [],
    allowOther: true,
  },
];

const answers: QuestionAnswer[] = [
  {
    questionId: 'q1',
    value: 'Summarize feedback',
    label: 'Summarize feedback',
    wasCustom: true,
  },
  {
    questionId: 'q2',
    value: 'Handle empty queues',
    label: 'Handle empty queues',
    wasCustom: true,
  },
];

describe('buildInterviewResult', () => {
  it('returns an aggregated Q/A transcript when the interview completes', () => {
    expect(buildInterviewResult(questions, answers, false)).toEqual({
      content: [
        {
          type: 'text',
          text: [
            'Q: What should this feature do?',
            'A: Summarize feedback',
            '',
            'Q: What edge cases matter?',
            'A: Handle empty queues',
          ].join('\n'),
        },
      ],
      details: { questions, answers, cancelled: false },
    });
  });

  it('returns a cancelled result without leaking partial answers', () => {
    expect(buildInterviewResult(questions, answers, true)).toEqual({
      content: [{ type: 'text', text: 'User cancelled the interview' }],
      details: { questions, answers: [], cancelled: true },
    });
  });
});
