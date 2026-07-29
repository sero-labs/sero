import { describe, expect, it } from 'vitest';

import type { TweakDefinition } from './tweaks';
import {
  BASELINE_FONT_OPTIONS,
  BASELINE_TWEAKS,
  baselineTweakProblem,
} from './baseline-tweaks';

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
            options: BASELINE_FONT_OPTIONS.map(({ label, value }) => ({ label, value })),
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

    expect(baselineTweakProblem(wrong, SOURCE)).toContain('standard Design font list');
  });

  it('refuses a property connected to the wrong element', () => {
    const wrongSource = SOURCE.replace('h1 { font-family', '.hero { font-family');

    expect(baselineTweakProblem(controls(), wrongSource)).toContain(
      'h1 { font-family: var(--font-family); }',
    );
  });

  it('accepts descendant and qualified selectors that target the intended element', () => {
    const qualifiedSource = SOURCE
      .replace('h1 { font-family', '.hero h1.title { font-family')
      .replace('h2 { font-size', 'article > h2[data-level="2"] { font-size')
      .replace('body { font-family', 'body.theme-dark { font-family');

    expect(baselineTweakProblem(controls(), qualifiedSource)).toBeNull();
  });

  it('refuses a rule that targets a child inside the intended element', () => {
    const childSource = SOURCE.replace('h1 { font-family', 'h1 .title { font-family');

    expect(baselineTweakProblem(controls(), childSource)).toContain(
      'h1 { font-family: var(--font-family); }',
    );
  });

  it('refuses fixed text sizes that make Body size mostly inert', () => {
    const fixedSource = SOURCE.replace('</style>', '.label { font: 600 10px monospace; }</style>');

    expect(baselineTweakProblem(controls(), fixedSource)).toContain(
      'Body size must drive the page typography',
    );
  });

  it('refuses a fixed size hidden inside a CSS function', () => {
    const fixedSource = SOURCE.replace(
      '</style>',
      '.label { font-size: clamp(10px, 2vw, 14px); }</style>',
    );

    expect(baselineTweakProblem(controls(), fixedSource)).toContain(
      'Body size must drive the page typography',
    );
  });

  it('refuses Tailwind text utilities that compile to fixed rem sizes', () => {
    const fixedSource = `${SOURCE}<p className="text-sm md:text-lg">Fixed utility text</p>`;

    expect(baselineTweakProblem(controls(), fixedSource)).toContain(
      'Body size must drive the page typography',
    );
  });

  it('accepts a Tailwind arbitrary size that reads the derived type scale', () => {
    const derivedSource = `${SOURCE}<p className="text-[length:var(--text-sm)]">Scaled text</p>`;

    expect(baselineTweakProblem(controls(), derivedSource)).toBeNull();
  });
});
