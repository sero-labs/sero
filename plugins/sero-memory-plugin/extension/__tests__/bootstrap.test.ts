import { describe, expect, it } from 'vitest';

import { USER_QUESTIONS } from '../bootstrap';

describe('memory bootstrap questions', () => {
  it('offers caveman mode in the communication step', () => {
    const communication = USER_QUESTIONS.questions.find((question) => question.id === 'communication');

    const caveman = communication?.options.find((option) => option.value === 'caveman');

    expect(caveman).toEqual(expect.objectContaining({ value: 'caveman' }));
    expect(caveman?.subQuestion?.options.map((option) => option.value)).toEqual([
      'lite',
      'full',
      'ultra',
    ]);
  });
});
