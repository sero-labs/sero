import { describe, expect, it } from 'vitest';

import type { TweakDefinition } from './tweaks';
import { BASELINE_TWEAKS, baselineTweakProblem } from './baseline-tweaks';

const SOURCE = `<style>
h1 { font-family: var(--font-family); font-size: var(--h1-size); font-weight: var(--h1-weight); letter-spacing: var(--h1-tracking); }
h2 { font-size: var(--h2-size); }
body { font-family: var(--body-font); font-size: var(--body-size); }
</style><h1>Title</h1><h2>Section</h2>`;

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
    expect(baselineTweakProblem(controls(), SOURCE)).toBeNull();
  });

  it('names a missing control', () => {
    const missing = controls().filter((control) => control.id !== 'h1-weight');

    expect(baselineTweakProblem(missing, SOURCE)).toContain('H1 weight');
  });

  it('refuses a standard property with the wrong control type', () => {
    const wrong = controls();
    wrong[1] = { ...wrong[1]!, control: { type: 'colour' }, defaultValue: '#000000' };

    expect(baselineTweakProblem(wrong, SOURCE)).toContain('control type `range`');
  });

  it('refuses font choices that the frame cannot load', () => {
    const wrong = controls();
    wrong[0] = {
      ...wrong[0]!,
      control: { type: 'choice', options: [{ label: 'Remote', value: 'Inter' }, { label: 'Sans', value: 'system-ui, sans-serif' }] },
      defaultValue: 'Inter',
    };

    expect(baselineTweakProblem(wrong, SOURCE)).toContain('only the system Sans and Mono stacks');
  });

  it('refuses a property connected to the wrong element', () => {
    const wrongSource = SOURCE.replace('h1 { font-family', '.hero { font-family');

    expect(baselineTweakProblem(controls(), wrongSource)).toContain(
      'h1 { font-family: var(--font-family); }',
    );
  });
});
