/**
 * The AI conflict-resolution contract (git-ux §7, §10).
 *
 * What is checked here is the *format* of the model's reply, never its
 * judgement — no invented confidence score, and declining is a first-class
 * answer rather than a failure. The one substantive guard is that a resolution
 * must not still contain conflict markers: writing that back would corrupt the
 * file while reporting success, which is the worst outcome available.
 */

import { describe, expect, it } from 'vitest';

import {
  buildConflictPrompt,
  parseConflictOutcome,
  type ConflictResolveInput,
} from '@electron/features/agent/assistants/conflict-resolve';

const INPUT: ConflictResolveInput = {
  path: 'src/lib/parse.ts',
  conflictNumber: 3,
  conflictCount: 4,
  current: 'const PRECISION = 2;',
  incoming: 'const PRECISION = 4;',
  currentLabel: 'HEAD',
  incomingLabel: 'feat/changelog',
  context: 'export function parse() {}',
  answers: [],
};

describe('parseConflictOutcome', () => {
  it('takes a resolution with its reason', () => {
    const outcome = parseConflictOutcome(
      '{"decision":"resolve","content":"const out = format(v, scale);","why":"kept the currency parameter"}',
    );
    expect(outcome).toEqual({
      decision: 'resolve',
      content: 'const out = format(v, scale);',
      why: 'kept the currency parameter',
    });
  });

  it('reads JSON out of surrounding prose or fences', () => {
    const outcome = parseConflictOutcome(
      'Here you go:\n```json\n{"decision":"resolve","content":"x","why":"y"}\n```',
    );
    expect(outcome.decision).toBe('resolve');
  });

  // Writing markers back would leave a corrupt file behind a success message.
  it('rejects a resolution that still contains conflict markers', () => {
    expect(() => parseConflictOutcome(
      '{"decision":"resolve","content":"<<<<<<< HEAD\\na\\n=======\\nb\\n>>>>>>> x","why":"n/a"}',
    )).toThrow(/conflict markers/);
  });

  it('takes a question with its real options', () => {
    const outcome = parseConflictOutcome(JSON.stringify({
      decision: 'ask',
      question: 'DEFAULT_PRECISION is 2 on main and 4 on the incoming branch. Which should I keep?',
      because: 'Nothing in either branch explains the change.',
      options: [
        { label: '2', detail: 'current · main', content: 'const PRECISION = 2;' },
        { label: '4', detail: 'incoming', content: 'const PRECISION = 4;' },
        { label: 'Let me edit it', detail: '' },
      ],
    }));

    expect(outcome.decision).toBe('ask');
    if (outcome.decision !== 'ask') throw new Error('unreachable');
    expect(outcome.options).toHaveLength(3);
    expect(outcome.options[0]).toEqual({ label: '2', detail: 'current · main', content: 'const PRECISION = 2;' });
    // No content means the option cannot be applied for you — you edit it.
    expect(outcome.options[2]?.content).toBeUndefined();
  });

  it('drops an option that has markers in it, and one with no label', () => {
    const outcome = parseConflictOutcome(JSON.stringify({
      decision: 'ask',
      question: 'Which?',
      options: [
        { label: 'ok', detail: '', content: 'fine' },
        { label: 'bad', detail: '', content: '<<<<<<< HEAD' },
        { detail: 'no label' },
      ],
    }));
    if (outcome.decision !== 'ask') throw new Error('unreachable');
    expect(outcome.options).toEqual([{ label: 'ok', detail: '', content: 'fine' }]);
  });

  // A model that always answers is worse than one that declines.
  it('takes a decline as an answer, with its reason', () => {
    const outcome = parseConflictOutcome('{"decision":"decline","why":"I cannot tell what this macro expands to."}');
    expect(outcome).toEqual({
      decision: 'decline',
      why: 'I cannot tell what this macro expands to.',
    });
  });

  it('throws rather than guessing at a malformed reply', () => {
    expect(() => parseConflictOutcome('I resolved it for you!')).toThrow();
    expect(() => parseConflictOutcome('{"decision":"resolve"}')).toThrow(/no content/);
    expect(() => parseConflictOutcome('{"decision":"ask","options":[]}')).toThrow(/no question/);
    expect(() => parseConflictOutcome('{"decision":"maybe"}')).toThrow(/unknown decision/);
  });
});

describe('buildConflictPrompt', () => {
  it('shows both sides, the file and which conflict this is', () => {
    const prompt = buildConflictPrompt(INPUT);
    expect(prompt).toContain('src/lib/parse.ts (conflict 3 of 4)');
    expect(prompt).toContain('const PRECISION = 2;');
    expect(prompt).toContain('const PRECISION = 4;');
  });

  it('omits the ancestor section when the markers had none', () => {
    expect(buildConflictPrompt(INPUT)).not.toContain('Common ancestor');
    expect(buildConflictPrompt({ ...INPUT, base: 'const PRECISION = 1;' }))
      .toContain('Common ancestor');
  });

  // The forward carry is the argument for automatic-first: a per-conflict
  // review loop structurally cannot apply your answer to the next conflict.
  it('carries earlier answers forward and says to apply them', () => {
    const prompt = buildConflictPrompt({
      ...INPUT,
      answers: [{ question: 'Which precision?', answer: '4 (incoming)' }],
    });
    expect(prompt).toContain('Which precision? → 4 (incoming)');
    expect(prompt).toContain('rather than');
  });
});
