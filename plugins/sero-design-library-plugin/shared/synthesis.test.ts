import { describe, expect, it } from 'vitest';

import type { ReferenceGuardrails } from './synthesis';
import {
  applyResolutions,
  isBlocked,
  synthesizeGuardrails,
  withReportedConflicts,
} from './synthesis';

/**
 * Order matters and the primary reference leads (spec §6.1), and only a
 * genuine incompatibility may block. These pin both, plus the rule that a
 * contradiction never reaches the generation run in one piece.
 */

function reference(
  itemId: string,
  order: number,
  always: string[] = [],
  never: string[] = [],
): ReferenceGuardrails {
  return { itemId, order, always, never };
}

describe('combining guardrails across references', () => {
  it('unions rules from every reference', () => {
    const synthesis = synthesizeGuardrails([
      reference('a', 0, ['Keep geometry square'], ['Decorative gradients']),
      reference('b', 1, ['Generous line height'], ['Drop shadows']),
    ]);

    expect(synthesis.always).toEqual(['Keep geometry square', 'Generous line height']);
    expect(synthesis.never).toEqual(['Decorative gradients', 'Drop shadows']);
    expect(isBlocked(synthesis)).toBe(false);
  });

  it('keeps the primary reference’s wording when two say the same thing', () => {
    const synthesis = synthesizeGuardrails([
      reference('secondary', 1, ['keep geometry square.']),
      reference('primary', 0, ['Keep geometry square']),
    ]);

    // Sorted by order, so the primary's capitalisation is what survives.
    expect(synthesis.always).toEqual(['Keep geometry square']);
  });

  it('treats case, surrounding space and a trailing full stop as the same rule', () => {
    const synthesis = synthesizeGuardrails([
      reference('a', 0, ['  Generous whitespace  ']),
      reference('b', 1, ['generous whitespace.']),
    ]);

    expect(synthesis.always).toHaveLength(1);
  });

  it('does not merge rules that merely look similar', () => {
    // Deciding these mean the same thing is the model's job, not this
    // module's — guessing here would silently drop a real guardrail.
    const synthesis = synthesizeGuardrails([
      reference('a', 0, ['Generous whitespace']),
      reference('b', 1, ['Plenty of whitespace']),
    ]);

    expect(synthesis.always).toHaveLength(2);
  });
});

describe('blocking conflicts', () => {
  it('blocks when one reference requires what another forbids', () => {
    const synthesis = synthesizeGuardrails([
      reference('a', 0, ['Drop shadows']),
      reference('b', 1, [], ['drop shadows']),
    ]);

    expect(isBlocked(synthesis)).toBe(true);
    expect(synthesis.conflicts).toEqual([
      { rule: 'Drop shadows', alwaysFrom: ['a'], neverFrom: ['b'] },
    ]);
  });

  it('keeps a conflicted rule off both lists until it is resolved', () => {
    const synthesis = synthesizeGuardrails([
      reference('a', 0, ['Drop shadows']),
      reference('b', 1, [], ['Drop shadows']),
    ]);

    // Emitting it on both sides would hand the generation run a brief that
    // contradicts itself — the thing blocking exists to prevent.
    expect(synthesis.always).toEqual([]);
    expect(synthesis.never).toEqual([]);
  });

  it('records every reference on each side of a conflict', () => {
    const synthesis = synthesizeGuardrails([
      reference('a', 0, ['Drop shadows']),
      reference('b', 1, ['Drop shadows']),
      reference('c', 2, [], ['Drop shadows']),
    ]);

    expect(synthesis.conflicts[0]?.alwaysFrom).toEqual(['a', 'b']);
    expect(synthesis.conflicts[0]?.neverFrom).toEqual(['c']);
  });
});

describe('conflicts the model reported', () => {
  it('folds them in alongside the mechanical ones', () => {
    const base = synthesizeGuardrails([
      reference('a', 0, ['Generous whitespace']),
      reference('b', 1, ['Dense information display']),
    ]);
    expect(isBlocked(base)).toBe(false);

    const merged = withReportedConflicts(base, [
      { rule: 'Generous whitespace', alwaysFrom: ['a'], neverFrom: ['b'] },
    ]);

    expect(isBlocked(merged)).toBe(true);
    // And the reported rule leaves the plain list, exactly as a mechanical
    // conflict would.
    expect(merged.always).toEqual(['Dense information display']);
  });

  it('does not double-report something already found mechanically', () => {
    const base = synthesizeGuardrails([
      reference('a', 0, ['Drop shadows']),
      reference('b', 1, [], ['Drop shadows']),
    ]);

    const merged = withReportedConflicts(base, [
      { rule: 'drop shadows', alwaysFrom: ['a'], neverFrom: ['b'] },
    ]);

    expect(merged.conflicts).toHaveLength(1);
  });
});

describe('resolving before generation starts', () => {
  const conflicted = () =>
    synthesizeGuardrails([
      reference('a', 0, ['Drop shadows'], ['Flat colour']),
      reference('b', 1, [], ['Drop shadows']),
    ]);

  it('refuses while any conflict is unresolved', () => {
    expect(applyResolutions(conflicted(), [])).toBeNull();
  });

  it('puts the kept side back on its list and records what was dropped', () => {
    const applied = applyResolutions(conflicted(), [{ rule: 'Drop shadows', keep: 'never' }]);

    expect(applied?.never).toContain('Drop shadows');
    expect(applied?.always).not.toContain('Drop shadows');
    expect(applied?.resolved).toEqual([
      { rule: 'Drop shadows', keptFromItemId: 'b', droppedFromItemIds: ['a'] },
    ]);
  });

  it('can keep the requirement instead', () => {
    const applied = applyResolutions(conflicted(), [{ rule: 'Drop shadows', keep: 'always' }]);

    expect(applied?.always).toContain('Drop shadows');
    expect(applied?.resolved[0]?.keptFromItemId).toBe('a');
  });

  it('carries unconflicted rules through untouched', () => {
    const applied = applyResolutions(conflicted(), [{ rule: 'Drop shadows', keep: 'never' }]);

    expect(applied?.never).toContain('Flat colour');
  });

  it('matches a resolution to its conflict regardless of wording noise', () => {
    const applied = applyResolutions(conflicted(), [{ rule: '  drop shadows.  ', keep: 'never' }]);

    expect(applied).not.toBeNull();
  });
});

describe('rules the user adds for one Design', () => {
  const plain = () =>
    synthesizeGuardrails([reference('a', 0, ['Drop shadows'], ['Flat colour'])]);

  it('puts a session rule in force alongside the references\' own', () => {
    const applied = applyResolutions(plain(), [], ['Keep the palette to two colours']);

    // In `always` because that is what the generation prompt reads, and in
    // `session` because the record has to be able to say the user asked for it.
    expect(applied?.always).toContain('Keep the palette to two colours');
    expect(applied?.session).toEqual(['Keep the palette to two colours']);
  });

  it('drops a session rule the references already state', () => {
    // Repeating it would read to the run as emphasis nobody gave it.
    const applied = applyResolutions(plain(), [], ['  drop shadows.  ']);

    expect(applied?.session).toEqual([]);
    expect(applied?.always.filter((rule) => /drop shadows/i.test(rule))).toHaveLength(1);
  });

  it('ignores blank rules and does not repeat itself', () => {
    const applied = applyResolutions(plain(), [], ['   ', 'Two columns', 'Two columns']);

    expect(applied?.session).toEqual(['Two columns']);
  });

  it('will not smuggle in a rule the references forbid', () => {
    const applied = applyResolutions(plain(), [], ['Flat colour']);

    expect(applied?.session).toEqual([]);
    expect(applied?.always).not.toContain('Flat colour');
  });
});
