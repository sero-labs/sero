// @vitest-environment jsdom

/**
 * The panel is generic: it renders whatever the manifest declares. These tests
 * use two unrelated manifests to prove no design-specific UI code exists.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TweaksPanel } from './TweaksPanel';
import type { TweakManifest, TweakValue } from '../../shared/tweak-types';

const typographyManifest: TweakManifest = {
  schemaVersion: 1,
  variantRevisionId: 'rev-1',
  controls: [
    {
      id: 'measure',
      group: 'Typography',
      label: 'Line measure',
      cssVariable: '--measure',
      control: { type: 'range', min: 40, max: 90, step: 1, unit: 'ch' },
      defaultValue: 68,
    },
    {
      id: 'ink',
      group: 'Colour',
      label: 'Ink',
      cssVariable: '--ink',
      control: { type: 'colour' },
      defaultValue: '#101014',
    },
  ],
};

const motionManifest: TweakManifest = {
  schemaVersion: 1,
  variantRevisionId: 'rev-2',
  controls: [
    {
      id: 'drift',
      group: 'Motion',
      label: 'Panel drift',
      cssVariable: '--drift',
      control: { type: 'toggle', offValue: 'none', onValue: 'drift 8s ease-in-out infinite' },
      defaultValue: 'none',
    },
    {
      id: 'grain',
      group: 'Surface',
      label: 'Grain',
      cssVariable: '--grain',
      control: {
        type: 'choice',
        options: [
          { label: 'Off', value: '0' },
          { label: 'Subtle', value: '0.04' },
          { label: 'Coarse', value: '0.12' },
        ],
      },
      defaultValue: '0',
    },
  ],
};

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container.remove();
  root = null;
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

interface RenderOptions {
  manifest: TweakManifest;
  values?: Record<string, TweakValue>;
  overrides?: Record<string, TweakValue>;
  dropped?: Array<{ id: string; label: string; reason: string }>;
}

async function render(options: RenderOptions) {
  const onChange = vi.fn();
  const onReset = vi.fn();
  const onCopyCss = vi.fn();

  await act(async () => {
    root?.render(
      <TweaksPanel
        dropped={options.dropped ?? []}
        manifest={options.manifest}
        onChange={onChange}
        onCopyCss={onCopyCss}
        onReset={onReset}
        overrides={options.overrides ?? {}}
        values={options.values ?? Object.fromEntries(
          options.manifest.controls.map((control) => [control.id, control.defaultValue]),
        )}
      />,
    );
  });

  return { onChange, onReset, onCopyCss };
}

describe('TweaksPanel', () => {
  it('renders the groups and controls the manifest declares', async () => {
    await render({ manifest: typographyManifest });

    expect(container.textContent).toContain('Typography');
    expect(container.textContent).toContain('Line measure');
    expect(container.querySelector('[data-slot="slider"]')).not.toBeNull();
    expect(container.querySelector('input[type="color"]')).not.toBeNull();
  });

  it('renders a completely different manifest with no design-specific code', async () => {
    await render({ manifest: motionManifest });

    expect(container.textContent).toContain('Motion');
    expect(container.textContent).toContain('Panel drift');
    expect(container.querySelector('[role="switch"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="select-trigger"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="slider"]')).toBeNull();
  });

  it('reports a value change with the control id', async () => {
    const { onChange } = await render({ manifest: typographyManifest });
    const slider = container.querySelector<HTMLElement>('[role="slider"]');
    if (!slider) throw new Error('Range control not found');

    await act(async () => {
      slider.focus();
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith('measure', 69);
  });

  it('changes a colour control through its value', async () => {
    const { onChange } = await render({ manifest: typographyManifest });
    const colour = container.querySelector<HTMLInputElement>('input[type="color"]');
    if (!colour) throw new Error('Colour control not found');

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
        ?.set?.call(colour, '#ff0000');
      colour.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith('ink', '#ff0000');
  });

  it('reports a toggle change with the declared on and off values', async () => {
    const { onChange } = await render({ manifest: motionManifest });
    const toggle = container.querySelector<HTMLElement>('[role="switch"]');
    if (!toggle) throw new Error('Toggle control not found');

    await act(async () => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith('drift', 'drift 8s ease-in-out infinite');
  });

  it('offers per-control reset only for overridden controls', async () => {
    const { onReset } = await render({
      manifest: typographyManifest,
      overrides: { measure: 80 },
      values: { measure: 80, ink: '#101014' },
    });

    expect(container.querySelector('button[aria-label="Reset Line measure"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Reset Ink"]')).toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Reset Line measure"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onReset).toHaveBeenCalledWith('measure');
  });

  it('enables Reset all only when something is overridden', async () => {
    await render({ manifest: typographyManifest });
    const resetAll = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Reset all'));
    expect(resetAll?.hasAttribute('disabled')).toBe(true);
    expect(container.textContent).toContain('At generated defaults');
  });

  it('explains controls that were removed', async () => {
    await render({
      manifest: typographyManifest,
      dropped: [{ id: 'ghost', label: 'Ghost', reason: 'The design does not declare --ghost.' }],
    });

    expect(container.textContent).toContain('1 controls were removed');
  });

  it('says so when a design exposes nothing adjustable', async () => {
    await render({ manifest: { schemaVersion: 1, variantRevisionId: 'rev-3', controls: [] } });
    expect(container.textContent).toContain('exposes no adjustable properties');
  });
});
