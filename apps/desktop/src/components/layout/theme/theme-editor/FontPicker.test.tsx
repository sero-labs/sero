// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/lib/google-fonts', () => ({
  loadGoogleFont: vi.fn(),
  preloadAllGoogleFonts: vi.fn(),
}));

describe('FontPicker', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container.remove();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('preloads Google fonts once after mount', async () => {
    const { FontPicker, SANS_PRESETS } = await import('./FontPicker');
    const googleFonts = await import('@/lib/google-fonts');
    const onChange = vi.fn();

    await act(async () => {
      root?.render(
        <FontPicker
          label="Sans-serif"
          value={SANS_PRESETS[0]!.value}
          presets={SANS_PRESETS}
          onChange={onChange}
        />,
      );
    });

    expect(googleFonts.preloadAllGoogleFonts).toHaveBeenCalledTimes(1);

    await act(async () => {
      root?.render(
        <>
          <FontPicker
            label="Sans-serif"
            value={SANS_PRESETS[0]!.value}
            presets={SANS_PRESETS}
            onChange={onChange}
          />
          <FontPicker
            label="Monospace"
            value={SANS_PRESETS[1]!.value}
            presets={SANS_PRESETS}
            onChange={onChange}
          />
        </>,
      );
    });

    expect(googleFonts.preloadAllGoogleFonts).toHaveBeenCalledTimes(1);
  });

  it('loads the selected preset font and forwards the chosen value', async () => {
    const { FontPicker, SANS_PRESETS } = await import('./FontPicker');
    const googleFonts = await import('@/lib/google-fonts');
    const onChange = vi.fn();

    await act(async () => {
      root?.render(
        <FontPicker
          label="Sans-serif"
          value={SANS_PRESETS[0]!.value}
          presets={SANS_PRESETS}
          onChange={onChange}
        />,
      );
    });

    const interButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Inter',
    );
    expect(interButton).toBeTruthy();
    if (!interButton) {
      throw new Error('Expected Inter preset button');
    }

    await act(async () => {
      interButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(googleFonts.loadGoogleFont).toHaveBeenCalledWith("'Inter', system-ui, sans-serif");
    expect(onChange).toHaveBeenCalledWith("'Inter', system-ui, sans-serif");
  });
});
