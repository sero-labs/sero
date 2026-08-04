import { describe, expect, it } from 'vitest';

import { validateTweakControls } from './tweaks-validate';

/**
 * The rule under test is the one the feature rests on: a control that does not
 * move anything on the page never reaches the panel. Everything here is a way of
 * a control failing to be true of the page it claims to control.
 */

const PAGE = `:root { --display-scale: 34px; --grid-gap: 12px; --panel-border: 1px; }
h1 { font-size: var(--display-scale); }
.grid { gap: var(--grid-gap); }
.panel { border-width: var(--panel-border); }`;

function control(overrides: Record<string, unknown> = {}) {
  return {
    id: 'display-scale',
    group: 'Typography',
    label: 'Display scale',
    cssVariable: '--display-scale',
    defaultValue: '34',
    control: { type: 'range', min: 24, max: 64, step: 1, unit: 'px' },
    ...overrides,
  };
}

describe('validating an authored tweak manifest', () => {
  it('keeps a control bound to a property the page declares and reads', () => {
    const { manifest, dropped } = validateTweakControls([control()], PAGE, 'rev-1');

    expect(dropped).toEqual([]);
    expect(manifest.variantRevisionId).toBe('rev-1');
    expect(manifest.controls).toHaveLength(1);
    // The default is coerced onto the control, so a range stores a number even
    // though every value crosses the tool boundary as a string.
    expect(manifest.controls[0]?.defaultValue).toBe(34);
  });

  it('drops a control for a property the page never declares', () => {
    const { manifest, dropped } = validateTweakControls(
      [control({ id: 'ghost', cssVariable: '--nowhere' })],
      PAGE,
      'rev-1',
    );

    expect(manifest.controls).toEqual([]);
    expect(dropped[0]?.reason).toContain('never declares');
  });

  it('drops a control for a property the page declares but never reads', () => {
    // The failure that looks most legitimate: the property exists, so a check
    // that stopped at "is it declared" would show a slider that does nothing.
    const page = `${PAGE}\n:root { --unused-accent: #16805f; }`;
    const { manifest, dropped } = validateTweakControls(
      [control({ id: 'accent', cssVariable: '--unused-accent', control: { type: 'colour' }, defaultValue: '#16805f' })],
      page,
      'rev-1',
    );

    expect(manifest.controls).toEqual([]);
    expect(dropped[0]?.reason).toContain('never reads it');
  });

  it('does not mistake a longer property name for the one it was given', () => {
    // `--grid` is a prefix of `--grid-gap`. Without the boundary check it would
    // pass both halves and bind to a property that does not exist.
    const { manifest, dropped } = validateTweakControls(
      [control({ id: 'grid', cssVariable: '--grid' })],
      PAGE,
      'rev-1',
    );

    expect(manifest.controls).toEqual([]);
    expect(dropped[0]?.reason).toContain('never declares');
  });

  it('accepts a property declared through a React inline style object', () => {
    const page = `export default function App() {
  return <div style={{ '--display-scale': '34px' }}><h1 className="text-[length:var(--display-scale)]">Hi</h1></div>;
}`;
    const { manifest } = validateTweakControls([control()], page, 'rev-1');

    expect(manifest.controls).toHaveLength(1);
  });

  it('drops a second control fighting over the same property', () => {
    const { manifest, dropped } = validateTweakControls(
      [control(), control({ id: 'display-scale-again' })],
      PAGE,
      'rev-1',
    );

    expect(manifest.controls).toHaveLength(1);
    expect(dropped[0]?.reason).toContain('cannot own one property');
  });

  it('drops a duplicate id, whichever property it claims', () => {
    const { manifest, dropped } = validateTweakControls(
      [control(), control({ cssVariable: '--grid-gap' })],
      PAGE,
      'rev-1',
    );

    expect(manifest.controls).toHaveLength(1);
    expect(dropped[0]?.reason).toContain('already uses the id');
  });

  it('drops a malformed control without losing the ones around it', () => {
    const { manifest, dropped } = validateTweakControls(
      [
        control({ id: 'broken', cssVariable: '--grid-gap', control: { type: 'range', min: 10, max: 4 } }),
        control(),
      ],
      PAGE,
      'rev-1',
    );

    expect(manifest.controls.map((entry) => entry.id)).toEqual(['display-scale']);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]?.label).toBe('Display scale');
  });

  it('names a control that was too malformed to have a label', () => {
    const { dropped } = validateTweakControls([{ nonsense: true }], PAGE, 'rev-1');

    expect(dropped[0]?.label).toBe('Control 1');
  });

  it('drops a choice with fewer than two distinct options', () => {
    const { manifest, dropped } = validateTweakControls(
      [
        control({
          id: 'weight',
          cssVariable: '--grid-gap',
          defaultValue: '12px',
          control: { type: 'choice', options: [{ label: 'Only', value: '12px' }] },
        }),
      ],
      PAGE,
      'rev-1',
    );

    expect(manifest.controls).toEqual([]);
    expect(dropped).toHaveLength(1);
  });

  it('drops a default value the control does not accept', () => {
    const { manifest, dropped } = validateTweakControls(
      [control({ control: { type: 'colour' }, defaultValue: 'not-a-colour' })],
      PAGE,
      'rev-1',
    );

    expect(manifest.controls).toEqual([]);
    expect(dropped).toHaveLength(1);
  });
});
