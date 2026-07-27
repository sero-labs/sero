import { describe, expect, it } from 'vitest';

import type { TweakDefinition, TweakManifest } from './tweaks';
import {
  editedTweakCount,
  effectiveTweakValue,
  groupTweaks,
  normalizeTweakControl,
  normalizeTweakDocument,
  normalizeTweakValue,
  pruneOverrides,
  tweakCssBlock,
  tweakValueToCss,
} from './tweaks';

/**
 * Values are the part of tweaks that crosses three boundaries — the UI, the
 * request log, and the preview frame — so they are coerced at each one. These
 * cover what coercion must do and what it must refuse.
 */

const range: TweakDefinition = {
  id: 'scale',
  group: 'Typography',
  label: 'Display scale',
  cssVariable: '--display-scale',
  control: { type: 'range', min: 24, max: 64, step: 2, unit: 'px' },
  defaultValue: 34,
};

const choice: TweakDefinition = {
  id: 'weight',
  group: 'Typography',
  label: 'Heading weight',
  cssVariable: '--heading-weight',
  control: {
    type: 'choice',
    options: [
      { label: '600', value: '600' },
      { label: '680', value: '680' },
    ],
  },
  defaultValue: '600',
};

const toggle: TweakDefinition = {
  id: 'borders',
  group: 'Structure',
  label: 'Panel borders',
  cssVariable: '--panel-border',
  control: { type: 'toggle', offValue: '0', onValue: '1px' },
  defaultValue: '1px',
};

const colour: TweakDefinition = {
  id: 'accent',
  group: 'Colour',
  label: 'Signal accent',
  cssVariable: '--signal',
  control: { type: 'colour' },
  defaultValue: '#16805f',
};

const manifest: TweakManifest = {
  schemaVersion: 1,
  variantRevisionId: 'rev-1',
  controls: [range, choice, toggle, colour],
};

describe('coercing a value onto its control', () => {
  it('clamps and snaps a range, and keeps the step’s precision', () => {
    expect(normalizeTweakValue(range.control, 100)).toBe(64);
    expect(normalizeTweakValue(range.control, 10)).toBe(24);
    // A drag lands between steps; the value stored is one the control can show.
    expect(normalizeTweakValue(range.control, 35)).toBe(36);
    // Values cross the request log as strings, so a numeric string is the
    // ordinary case rather than an oddity.
    expect(normalizeTweakValue(range.control, '40')).toBe(40);
    expect(normalizeTweakValue(range.control, 'wide')).toBeNull();
  });

  it('refuses a choice the manifest does not offer', () => {
    expect(normalizeTweakValue(choice.control, '680')).toBe('680');
    expect(normalizeTweakValue(choice.control, '900')).toBeNull();
  });

  it('accepts either side of a toggle, and a bare boolean from a switch', () => {
    expect(normalizeTweakValue(toggle.control, '0')).toBe('0');
    expect(normalizeTweakValue(toggle.control, true)).toBe('1px');
    expect(normalizeTweakValue(toggle.control, false)).toBe('0');
    expect(normalizeTweakValue(toggle.control, 'hairline')).toBeNull();
  });

  it('accepts only a hex colour', () => {
    expect(normalizeTweakValue(colour.control, '#FFF')).toBe('#FFF');
    expect(normalizeTweakValue(colour.control, '#16805f')).toBe('#16805f');
    // Anything that could carry a second declaration is not a colour.
    expect(normalizeTweakValue(colour.control, 'red; behavior: url(x)')).toBeNull();
    expect(normalizeTweakValue(colour.control, 'rgb(1,2,3)')).toBeNull();
  });

  it('renders a range with its unit and everything else as it stands', () => {
    expect(tweakValueToCss(range.control, 36)).toBe('36px');
    expect(tweakValueToCss(choice.control, '680')).toBe('680');
    expect(tweakValueToCss(colour.control, '#16805f')).toBe('#16805f');
  });
});

describe('effective values', () => {
  it('falls back to the default when there is no override', () => {
    expect(effectiveTweakValue(range, {})).toBe(34);
    expect(effectiveTweakValue(range, { scale: 48 })).toBe(48);
  });

  it('falls back to the default when a stored override no longer fits', () => {
    // A revise can replace the manifest under a stored value. The default is
    // always something the current page accepts; the stale override is not.
    expect(effectiveTweakValue(choice, { weight: '900' })).toBe('600');
  });

  it('drops overrides for controls the manifest no longer declares', () => {
    expect(pruneOverrides(manifest, { scale: 48, gone: '3' })).toEqual({ scale: 48 });
  });

  it('counts only the controls that differ from what the design shipped with', () => {
    expect(editedTweakCount(manifest, { scale: 34, weight: '680' })).toBe(1);
  });
});

describe('Copy CSS', () => {
  it('writes every control, with the overrides applied', () => {
    expect(tweakCssBlock(manifest, { scale: 48, accent: '#2f6fb5' })).toBe(
      [
        ':root {',
        '  --display-scale: 48px;',
        '  --heading-weight: 600;',
        '  --panel-border: 1px;',
        '  --signal: #2f6fb5;',
        '}',
      ].join('\n'),
    );
  });

  it('is empty when the revision has no controls', () => {
    expect(tweakCssBlock({ ...manifest, controls: [] }, {})).toBe('');
  });
});

describe('a control the preview would refuse', () => {
  /**
   * The frame drops any value that could close a declaration, silently — as a
   * sandbox should. A control kept here but refused there is the worst outcome
   * available: it renders, it moves, it saves, and the page never changes. So
   * anything the frame would refuse disqualifies the control at this end.
   */
  it('drops a choice option carrying a statement terminator', () => {
    const control = normalizeTweakControl({
      type: 'choice',
      options: [
        { label: 'Tight', value: '0.9' },
        { label: 'Loose', value: '1.4' },
        { label: 'Broken', value: '1; --accent: red' },
      ],
    });

    expect(control).toEqual({
      type: 'choice',
      options: [
        { label: 'Tight', value: '0.9' },
        { label: 'Loose', value: '1.4' },
      ],
    });
  });

  it('drops the whole choice when too few usable options are left', () => {
    expect(
      normalizeTweakControl({
        type: 'choice',
        options: [
          { label: 'Fine', value: '1.4' },
          { label: 'Calc', value: 'calc(100% - 2rem)' },
        ],
      }),
    ).toBeNull();
  });

  it('drops a toggle whose on or off value would be refused', () => {
    expect(
      normalizeTweakControl({ type: 'toggle', onValue: 'clamp(1rem, 2vw, 2rem)', offValue: '1rem' }),
    ).toBeNull();
    expect(normalizeTweakControl({ type: 'toggle', onValue: 'block', offValue: 'none' })).toEqual({
      type: 'toggle',
      onValue: 'block',
      offValue: 'none',
    });
  });

  it('drops a range whose unit would be refused, rather than dropping the unit', () => {
    // Stripping it would leave a slider that sets `12` where it meant `12px` —
    // a control that is wrong rather than one that is missing.
    expect(normalizeTweakControl({ type: 'range', min: 0, max: 10, step: 1, unit: 'px)' })).toBeNull();
  });

  it('leaves an ordinary control alone', () => {
    expect(normalizeTweakControl({ type: 'range', min: 24, max: 64, step: 2, unit: 'px' })).toEqual({
      type: 'range',
      min: 24,
      max: 64,
      step: 2,
      unit: 'px',
    });
  });
});

describe('reading a manifest back', () => {
  it('keeps the model’s own grouping and order', () => {
    expect(groupTweaks(manifest.controls).map((entry) => entry.group)).toEqual([
      'Typography',
      'Structure',
      'Colour',
    ]);
  });

  it('turns a damaged manifest into an empty one rather than throwing', () => {
    expect(normalizeTweakDocument('nonsense').manifest.controls).toEqual([]);
    expect(normalizeTweakDocument({ manifest: { controls: [{ id: 'x' }] } }).manifest.controls).toEqual(
      [],
    );
  });

  it('carries the dropped controls back with the manifest', () => {
    const document = normalizeTweakDocument({
      manifest: { schemaVersion: 1, variantRevisionId: 'rev-1', controls: [] },
      dropped: [{ label: 'Ghost', reason: 'the page never declares `--ghost`' }, { label: 42 }],
    });

    expect(document.dropped).toEqual([{ label: 'Ghost', reason: 'the page never declares `--ghost`' }]);
  });
});
