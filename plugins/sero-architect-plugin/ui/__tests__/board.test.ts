import { describe, expect, it } from 'vitest';
import { sessionStartedAt } from '@sero-ai/common';

import { projectActivity } from '../../shared/activity';
import type { ProjectRecord } from '../../shared/record';
import { DELIVERY_FIXTURES } from '../__preview__/delivery-fixture';
import { DECISION, FIXTURES } from '../__preview__/fixture';
import { boardOf, toolPhrase } from '../lib/board';

/** The board for a record the way the project page asks for it. */
function boardFor(record: ProjectRecord, live = false, action?: string) {
  const activity = projectActivity(record, { sessionStartedAt: sessionStartedAt(), runtimeRunning: true, feedback: null });
  return boardOf(record, activity, { live, action });
}

describe('which large tiles the board shows', () => {
  it('puts an open decision first and says the project waits for the user', () => {
    const board = boardFor({ ...FIXTURES.build!, decisions: [DECISION] });
    expect(board.main[0]).toBe('ask');
    expect(board.tone).toBe('waiting');
    expect(board.word).toBe('Waiting for you.');
  });

  it('shows the stop at the spend cap', () => {
    const base = FIXTURES.limited!;
    const board = boardFor({ ...base, budget: { ...base.budget, spentUsd: base.budget.capUsd ?? 0 } });
    expect(board.main).toContain('stopped');
    expect(board.tone).toBe('stopped');
  });

  it('shows only the live tile when work runs and nothing is needed', () => {
    const board = boardFor(DELIVERY_FIXTURES['board-working']!, true, 'Running a command');
    expect(board.main).toEqual(['live']);
    expect(board.tone).toBe('working');
    expect(board.word).toBe('Working.');
    expect(board.detail).toBe('Running a command.');
  });

  it('shows the result of a delivered project with nothing live', () => {
    const board = boardFor(DELIVERY_FIXTURES['board-done']!);
    expect(board.main).toEqual(['result']);
    expect(board.tone).toBe('done');
  });

  it('keeps a stopped Workflow and its fix on the board while a question is open', () => {
    const base = FIXTURES.build!;
    const failed = { ...base.milestones[1]!, dispatch: { ...base.milestones[1]!.dispatch!, failure: 'The step ran out of time.' } };
    const record: ProjectRecord = { ...base, decisions: [DECISION], milestones: [base.milestones[0]!, failed] };
    const options = { sessionStartedAt: sessionStartedAt(), runtimeRunning: true, feedback: null };
    const beneath = projectActivity({ ...record, decisions: [] }, options);
    const board = boardOf(record, projectActivity(record, options), { live: false, beneath });
    expect(board.main).toEqual(['ask', 'stopped']);
  });

  it('offers the written plan and the research before any step exists', () => {
    const record: ProjectRecord = { ...DELIVERY_FIXTURES['board-start']!, working: DELIVERY_FIXTURES['board-working']!.working };
    const board = boardFor(record);
    expect(board.steps).toEqual([]);
    expect(board.planNote).toBe(record.working?.objective);
  });

  it('keeps a paused project paused while its last turns finish', () => {
    const board = boardFor(DELIVERY_FIXTURES['delivery-pausing']!, true, 'Editing a file');
    expect(board.word).toBe('Paused by you.');
    expect(board.tone).not.toBe('working');
  });

  it('says the project waits when the Architect registered a wait and nothing runs', () => {
    const record = DELIVERY_FIXTURES['board-waiting']!;
    const activity = projectActivity(record, { sessionStartedAt: sessionStartedAt(), runtimeRunning: true, feedback: null });
    const board = boardOf(record, activity, { live: false, waitingFor: 'the test Room' });
    expect(board.word).toBe('Waiting.');
    expect(board.detail).toContain('the test Room');
  });

  it('keeps asking while other work continues', () => {
    const board = boardFor({ ...DELIVERY_FIXTURES['board-working']!, decisions: [DECISION] }, true);
    expect(board.main).toEqual(['ask', 'live']);
    expect(board.detail).toBe('Other work continues.');
  });
});

describe('the plan and what has been decided', () => {
  it('has no steps and no progress while there are no milestones', () => {
    const board = boardFor({ ...FIXTURES.build!, milestones: [] });
    expect(board.steps).toEqual([]);
    expect(board.progress).toBeNull();
  });

  it('counts the accepted steps against all of them', () => {
    const board = boardFor(DELIVERY_FIXTURES['board-working']!);
    expect(board.steps.map((step) => step.state)).toEqual(['done', 'doing']);
    expect(board.progress).toEqual({ done: 1, total: 2 });
  });

  it('lists what the user answered, what the Architect assumed and why, and the cap', () => {
    const record = DELIVERY_FIXTURES['board-done']!;
    const answered = record.decisions[0]!;
    const assumed = record.working!.assumptions.map((entry) => (typeof entry === 'string' ? { text: entry } : entry));
    const cap = record.budget.capUsd!;

    const made = boardFor(record).made;

    expect(made.map((row) => row.by)).toEqual(['you', ...assumed.map(() => 'architect'), 'you']);
    expect(made[0]).toMatchObject({ text: answered.options.find((option) => option.id === answered.answer?.optionId)?.label, why: answered.question });
    expect(made.filter((row) => row.by === 'architect').map((row) => ({ text: row.text, why: row.why }))).toEqual(assumed.map((entry) => ({ text: entry.text, why: entry.why })));
    expect(made.at(-1)?.text).toContain(String(cap));
  });

  it('lists nothing as decided before the project has started', () => {
    const board = boardFor(DELIVERY_FIXTURES['delivery-unapproved']!);
    expect(board.made).toEqual([]);
    expect(board.steps).toEqual([]);
  });
});

describe('toolPhrase', () => {
  it('says a known tool in plain words', () => {
    expect(toolPhrase('bash')).toMatch(/command/i);
    expect(toolPhrase('bash')).not.toBe('bash');
  });

  it('reads the tool from a call that carries its arguments', () => {
    expect(toolPhrase('bash npx playwright test')).toBe(toolPhrase('bash'));
  });

  it('keeps the name of a tool it does not know', () => {
    expect(toolPhrase('frobnicate')).toBe('frobnicate');
  });
});
