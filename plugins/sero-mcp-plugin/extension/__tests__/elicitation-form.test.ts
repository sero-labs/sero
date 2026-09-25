import type { UserFeedbackAnswer, UserFeedbackQuestionItem } from '@sero-ai/common';
import { describe, expect, it } from 'vitest';
import { answerFormRequest } from '../elicitation/answer-form';
import { buildFormQuestions, DECLINE_VALUE, parseFormAnswers } from '../elicitation/form-questionnaire';

const answer = (questionId: string, value: string, wasCustom = false): UserFeedbackAnswer => ({
  questionId, value, label: value, wasCustom,
});

const SCHEMA = {
  type: 'object',
  properties: {
    company: { type: 'string', title: 'Company', enum: ['acme', 'globex'], enumNames: ['Acme', 'Globex'] },
    team: { type: 'string', oneOf: [{ const: 'emea', title: 'EMEA sales' }] },
    tags: { type: 'array', items: { type: 'string', enum: ['vip', 'new'] }, maxItems: 2 },
    consent: { type: 'boolean', title: 'Email consent' },
    note: { type: 'string', maxLength: 10 },
    budget: { type: 'number', minimum: 0 },
    seats: { type: 'integer' },
  },
  required: ['company', 'seats'],
};

function build() {
  const built = buildFormQuestions('Details for the contact', SCHEMA, 'crm');
  if (!built.ok) throw new Error(built.reason);
  return built;
}

describe('MCP form questionnaire', () => {
  it('maps each field type to a question and adds Decline to the first one', () => {
    const { questions } = build();
    const byId = Object.fromEntries(questions.map((question) => [question.id, question]));

    expect(byId.company?.prompt).toBe('Details for the contact');
    expect(byId.company?.options.map((option) => option.label)).toEqual(['Acme', 'Globex', 'Decline']);
    expect(byId.company?.options.at(-1)).toMatchObject({ value: DECLINE_VALUE, exclusive: true });
    expect(byId.team?.options).toEqual([{ value: 'emea', label: 'EMEA sales' }]);
    expect(byId.tags).toMatchObject({ multiSelect: true, allowOther: false });
    expect(byId.consent?.options.map((option) => option.label)).toEqual(['Yes', 'No']);
    expect(byId.note).toMatchObject({ options: [], allowOther: true });
    expect(byId.seats).toMatchObject({ options: [], allowOther: true });
  });

  it('converts answers to the schema types', () => {
    const { fields } = build();
    const result = parseFormAnswers(fields, [
      answer('company', 'acme'),
      answer('team', 'emea'),
      answer('tags', 'vip'), answer('tags', 'new'),
      answer('consent', 'true'),
      answer('note', 'hello', true),
      answer('budget', '12.5', true),
      answer('seats', '3', true),
    ]);

    expect(result).toEqual({
      kind: 'accept',
      content: { company: 'acme', team: 'emea', tags: ['vip', 'new'], consent: true, note: 'hello', budget: 12.5, seats: 3 },
    });
  });

  it('rejects values that do not fit the schema', () => {
    const { fields } = build();
    expect(parseFormAnswers(fields, [answer('company', 'acme')])).toMatchObject({ kind: 'invalid', error: expect.stringContaining('required') });
    expect(parseFormAnswers(fields, [answer('company', 'acme'), answer('seats', '2.5', true)])).toMatchObject({ kind: 'invalid' });
    expect(parseFormAnswers(fields, [answer('company', 'other'), answer('seats', '1', true)])).toMatchObject({ kind: 'invalid' });
    expect(parseFormAnswers(fields, [answer('company', DECLINE_VALUE)])).toEqual({ kind: 'decline' });
  });

  it('keeps server markup as plain text and removes control characters', () => {
    const built = buildFormQuestions('<b>Hi</b>\u0007', {
      type: 'object',
      properties: { name: { type: 'string', title: '<img src=x onerror=alert(1)>' } },
    }, 'crm');

    expect(built.ok && built.questions[0]?.label).toBe('<img src=x onerror=alert(1)>');
    expect(built.ok && built.questions[0]?.prompt).toBe('<b>Hi</b>');
  });

  it('declines a form with an unsupported field without asking', async () => {
    const asked: UserFeedbackQuestionItem[][] = [];
    const answerResult = await answerFormRequest(
      { message: 'Upload', requestedSchema: { type: 'object', properties: { file: { type: 'object' } } } },
      'crm',
      async (questions) => { asked.push(questions); return []; },
    );

    expect(answerResult.result).toEqual({ action: 'decline' });
    expect(answerResult.notice).toContain('does not support');
    expect(asked).toHaveLength(0);
  });

  it('asks again once after a bad value, then declines', async () => {
    const prompts: string[] = [];
    const answerResult = await answerFormRequest(
      { message: 'Seats', requestedSchema: { type: 'object', properties: { seats: { type: 'integer' } }, required: ['seats'] } },
      'crm',
      async (questions) => { prompts.push(questions[0]?.prompt ?? ''); return [answer('seats', 'many', true)]; },
    );

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('must be a number');
    expect(answerResult.result).toEqual({ action: 'decline' });
  });

  it('accepts a corrected answer and returns cancel when the user cancels', async () => {
    const replies = [[answer('seats', 'many', true)], [answer('seats', '4', true)]];
    const request = { message: 'Seats', requestedSchema: { type: 'object', properties: { seats: { type: 'integer' } } } };

    expect((await answerFormRequest(request, 'crm', async () => replies.shift() ?? null)).result)
      .toEqual({ action: 'accept', content: { seats: 4 } });
    expect((await answerFormRequest(request, 'crm', async () => null)).result).toEqual({ action: 'cancel' });
  });
});
