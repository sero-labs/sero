import { describe, expect, it } from 'vitest';

import type { TweakDefinition } from './tweaks';
import { BASELINE_TWEAKS, baselineTweakProblem } from './baseline-tweaks';

function controls(): TweakDefinition[] {
  return BASELINE_TWEAKS.map((required) => ({
    id: required.id,
    group: 'Typography',
    label: required.label,
    cssVariable: required.cssVariable,
    control:
      required.type === 'choice'
        ? {
            type: 'choice',
            options: [
              { label: 'Sans', value: 'system-ui, sans-serif' },
              { label: 'Mono', value: 'ui-monospace, monospace' },
            ],
          }
        : { type: 'range', min: 1, max: 100, step: 1, unit: 'px' },
    defaultValue: required.type === 'choice' ? 'system-ui, sans-serif' : 16,
  }));
}

describe('baseline tweak contract', () => {
  it('accepts the exact standard controls in their stable order', () => {
    expect(baselineTweakProblem(controls())).toBeNull();
  });

  it('names a missing control', () => {
    const missing = controls().filter((control) => control.id !== 'h1-weight');

    expect(baselineTweakProblem(missing)).toContain('H1 weight');
  });

  it('refuses a standard property with the wrong control type', () => {
    const wrong = controls();
    wrong[1] = { ...wrong[1]!, control: { type: 'colour' }, defaultValue: '#000000' };

    expect(baselineTweakProblem(wrong)).toContain('control type `range`');
  });
});
