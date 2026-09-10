import { describe, expect, it } from 'vitest';
import { parseDecision } from '../decision-shape';
import { parseCharter } from '../charter-shape';

const options = JSON.stringify([{ id: 'a', label: 'A', consequence: 'x happens' }, { id: 'b', label: 'B', consequence: 'y happens' }]);

describe('decision shape', () => {
  it('refuses a decision without a recommendation and names the field', () => {
    const parsed = parseDecision({ question: 'Which?', optionsJson: options, reason: 'unclear' });
    expect(parsed).toEqual({ ok: false, error: expect.stringContaining('recommendation is required') });
  });

  it('refuses an option without a consequence', () => {
    const parsed = parseDecision({ question: 'Which?', optionsJson: JSON.stringify([{ id: 'a', label: 'A', consequence: 'x' }, { id: 'b', label: 'B' }]), recommendation: 'a', reason: 'r' });
    expect(parsed).toEqual({ ok: false, error: 'Option "b" has no consequence. Every option must say what happens if it is chosen.' });
  });

  it('refuses a recommendation that is not an option', () => {
    const parsed = parseDecision({ question: 'Which?', optionsJson: options, recommendation: 'c', reason: 'r' });
    expect(parsed.ok).toBe(false);
  });

  it('accepts the full shape and dedupes parked milestones', () => {
    const parsed = parseDecision({ question: 'Which?', optionsJson: options, recommendation: 'b', reason: 'r', parks: ['m1', 'm1', ' m2 '] });
    expect(parsed).toEqual({ ok: true, draft: expect.objectContaining({ recommendation: 'b', dependsOn: ['m1', 'm2'] }) });
  });
});

describe('charter shape', () => {
  it('refuses a charter without a cap', () => {
    const parsed = parseCharter({ milestonesJson: '[{"title":"Grid"}]', escalationPolicy: 'p' });
    expect(parsed).toEqual({ ok: false, error: expect.stringContaining('capUsd is required') });
  });

  it('defaults autonomy to milestones', () => {
    const parsed = parseCharter({ milestonesJson: '[{"title":"Grid","previewRoute":"/"}]', escalationPolicy: 'p', capUsd: 40 });
    expect(parsed).toEqual({ ok: true, draft: expect.objectContaining({ autonomy: 'milestones', capUsd: 40 }) });
  });
});
