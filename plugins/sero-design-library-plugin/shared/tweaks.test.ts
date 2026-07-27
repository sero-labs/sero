import { describe, expect, it } from 'vitest';
import {
  buildTweakCss,
  collectDeclaredCssVariables,
  isValidTweakValue,
  normaliseTweakValue,
  pruneTweakOverrides,
  resolveTweakValues,
  validateTweakManifest,
} from './tweaks';
import type { TweakManifest } from './tweak-types';

const CSS = `:root {
  --page-gap: 2rem;
  --accent: #3355ff;
  --corner: 8px;
  --density: comfortable;
}`;

const declared = collectDeclaredCssVariables(CSS);

function rawControl(overrides: Record<string, unknown> = {}) {
  return {
    id: 'page-gap',
    group: 'Spacing',
    label: 'Page gap',
    cssVariable: '--page-gap',
    control: { type: 'range', min: 0, max: 6, step: 0.5, unit: 'rem' },
    defaultValue: 2,
    ...overrides,
  };
}

describe('collectDeclaredCssVariables', () => {
  it('finds every declared custom property', () => {
    expect([...declared].sort()).toEqual(['--accent', '--corner', '--density', '--page-gap']);
  });
});

describe('validateTweakManifest', () => {
  it('keeps controls that bind to a declared property', () => {
    const { manifest, dropped } = validateTweakManifest(
      { controls: [rawControl()] },
      'rev-1',
      declared,
    );
    expect(dropped).toHaveLength(0);
    expect(manifest.controls).toHaveLength(1);
    expect(manifest.variantRevisionId).toBe('rev-1');
  });

  it('drops a control whose property the design never declares', () => {
    const { manifest, dropped } = validateTweakManifest(
      { controls: [rawControl({ cssVariable: '--not-real' })] },
      'rev-1',
      declared,
    );
    expect(manifest.controls).toHaveLength(0);
    expect(dropped[0].reason).toContain('--not-real');
  });

  it('drops duplicate ids and duplicate properties', () => {
    const { manifest, dropped } = validateTweakManifest(
      {
        controls: [
          rawControl(),
          rawControl({ id: 'page-gap-2' }),
          rawControl(),
        ],
      },
      'rev-1',
      declared,
    );
    expect(manifest.controls).toHaveLength(1);
    expect(dropped).toHaveLength(2);
  });

  it('refuses a default value that does not match its control', () => {
    const { manifest, dropped } = validateTweakManifest(
      { controls: [rawControl({ defaultValue: 99 })] },
      'rev-1',
      declared,
    );
    expect(manifest.controls).toHaveLength(0);
    expect(dropped[0].reason).toContain('default value');
  });

  it('refuses a value carrying CSS syntax', () => {
    const { manifest } = validateTweakManifest(
      {
        controls: [rawControl({
          id: 'density',
          cssVariable: '--density',
          control: {
            type: 'choice',
            options: [
              { label: 'Tight', value: 'tight' },
              { label: 'Injected', value: 'red; background: url(http://x)' },
            ],
          },
          defaultValue: 'tight',
        })],
      },
      'rev-1',
      declared,
    );
    expect(manifest.controls).toHaveLength(0);
  });

  it('is not a fixed catalogue — it only keeps what the design declared', () => {
    const { manifest } = validateTweakManifest({ controls: [] }, 'rev-1', declared);
    expect(manifest.controls).toEqual([]);
  });
});

describe('value validation', () => {
  const range = { type: 'range', min: 0, max: 6, step: 0.5 } as const;

  it('rejects out-of-range values', () => {
    expect(isValidTweakValue(range, 7)).toBe(false);
    expect(isValidTweakValue(range, 'big')).toBe(false);
  });

  it('snaps values onto the declared step', () => {
    expect(normaliseTweakValue(range, 1.7)).toBe(1.5);
    expect(normaliseTweakValue(range, 99)).toBe(null);
  });

  it('only accepts hex colours', () => {
    expect(normaliseTweakValue({ type: 'colour' }, '#AABBCC')).toBe('#aabbcc');
    expect(normaliseTweakValue({ type: 'colour' }, 'red')).toBe(null);
  });
});

describe('effective values and CSS', () => {
  const manifest: TweakManifest = validateTweakManifest(
    {
      controls: [
        rawControl(),
        rawControl({
          id: 'accent',
          group: 'Colour',
          label: 'Accent',
          cssVariable: '--accent',
          control: { type: 'colour' },
          defaultValue: '#3355ff',
        }),
      ],
    },
    'rev-1',
    declared,
  ).manifest;

  it('falls back to generated defaults', () => {
    expect(resolveTweakValues(manifest, {})).toEqual({ 'page-gap': 2, accent: '#3355ff' });
  });

  it('emits only overridden properties by default', () => {
    expect(buildTweakCss(manifest, { 'page-gap': 3 })).toBe(':root {\n  --page-gap: 3rem;\n}\n');
  });

  it('emits every property for export', () => {
    const css = buildTweakCss(manifest, { 'page-gap': 3 }, { includeDefaults: true });
    expect(css).toContain('--page-gap: 3rem;');
    expect(css).toContain('--accent: #3355ff;');
  });

  it('drops overrides that no longer match the manifest', () => {
    expect(pruneTweakOverrides(manifest, { 'page-gap': 3, gone: 1, accent: '#3355ff' }))
      .toEqual({ 'page-gap': 3 });
  });
});
