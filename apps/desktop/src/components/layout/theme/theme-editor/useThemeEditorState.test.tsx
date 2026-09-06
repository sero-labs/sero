// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTheme } from '@/lib/theme-engine';
import { useAppStore } from '@/stores/app';
import { useThemeStore } from '@/stores/theme';
import {
  DEFAULT_DARK_COLORS,
  DEFAULT_LIGHT_COLORS,
  DEFAULT_RADIUS,
  DEFAULT_SPACING,
  DEFAULT_TYPOGRAPHY,
  type ThemePreset,
} from '@/types/theme';
import { useThemeEditorState } from './useThemeEditorState';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const initialThemeState = useThemeStore.getState();
const initialAppState = useAppStore.getState();

// Advances the faked clock so debounced auto-saves fire without real waiting.
async function advanceTimers(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function createPreset(overrides: Partial<ThemePreset> = {}): ThemePreset {
  return {
    id: 'ocean-glow',
    name: 'Ocean Glow',
    description: 'Deep blue accents',
    version: 1,
    colors: {
      light: { ...DEFAULT_LIGHT_COLORS, bgBase: '#eef6ff' },
      dark: { ...DEFAULT_DARK_COLORS, bgBase: '#08111f', accentPrimary: '#33aaff' },
    },
    typography: { ...DEFAULT_TYPOGRAPHY },
    spacing: { ...DEFAULT_SPACING },
    radius: { ...DEFAULT_RADIUS },
    ...overrides,
  };
}

function Harness({
  editPresetId,
  onOpenChange,
  open,
}: {
  editPresetId?: string | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  latestState = useThemeEditorState({ editPresetId, onOpenChange, open });
  return null;
}

let latestState: ReturnType<typeof useThemeEditorState> | null = null;

describe('useThemeEditorState', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  const onOpenChangeSpy = vi.fn<(open: boolean) => void>();
  const resetThemePresetSpy = vi.fn<(id: string) => Promise<ThemePreset | null>>();
  const saveCustomPresetSpy = vi.fn<(preset: ThemePreset) => Promise<void>>();
  const saveLayoutSpy = vi.fn<typeof window.sero.layout.save>();
  const setPresetSpy = vi.fn<(id: string) => Promise<void>>();
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  const onOpenChange = (open: boolean) => {
    onOpenChangeSpy(open);
  };
  const resetThemePreset = async (id: string) => resetThemePresetSpy(id);
  const saveCustomPreset = async (preset: ThemePreset) => {
    await saveCustomPresetSpy(preset);
  };
  const setPreset = async (id: string) => {
    await setPresetSpy(id);
  };
  let resetPreset: ThemePreset;

  beforeEach(() => {
    latestState = null;
    onOpenChangeSpy.mockReset();
    resetThemePresetSpy.mockReset();
    saveCustomPresetSpy.mockReset();
    saveLayoutSpy.mockReset();
    setPresetSpy.mockReset();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resetPreset = createPreset({
      name: 'Restored Ocean Glow',
      colors: {
        light: { ...DEFAULT_LIGHT_COLORS, bgBase: '#f8fbff' },
        dark: { ...DEFAULT_DARK_COLORS, bgBase: '#020814', accentPrimary: '#55bbff' },
      },
    });
    resetThemePresetSpy.mockImplementation(async () => resetPreset);
    saveCustomPresetSpy.mockImplementation(async () => {});
    saveLayoutSpy.mockImplementation(async () => {});
    setPresetSpy.mockImplementation(async () => {});

    useThemeStore.setState(initialThemeState, true);
    useAppStore.setState(initialAppState, true);
    useThemeStore.setState({
      activePreset: createPreset(),
      activePresetId: 'ocean-glow',
      effectiveMode: 'dark',
      mode: 'dark',
      saveCustomPreset,
      setPreset,
    });

    const mockThemes: typeof window.sero.themes = {
      list: vi.fn(async () => []),
      load: vi.fn(async () => null),
      save: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      import: vi.fn(async () => null),
      export: vi.fn(async () => false),
      reset: resetThemePreset,
    };

    Object.defineProperty(window, 'sero', {
      configurable: true,
      writable: true,
      value: {
        layout: {
          load: vi.fn(async () => null),
          save: saveLayoutSpy,
        },
        themes: mockThemes,
      } satisfies Pick<typeof window.sero, 'layout' | 'themes'>,
    });

    resetTheme('system');
    document.documentElement.classList.remove('dark');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container.remove();
    Reflect.deleteProperty(window, 'sero');
    consoleWarnSpy.mockRestore();
    resetTheme('system');
    document.documentElement.classList.remove('dark');
    useThemeStore.setState(initialThemeState, true);
    useAppStore.setState(initialAppState, true);
  });

  it('initializes draft when the sheet opens and clears it when it closes', async () => {
    await act(async () => {
      root?.render(<Harness open={false} onOpenChange={onOpenChange} editPresetId="ocean-glow" />);
    });
    expect(latestState?.draft).toBeNull();

    await act(async () => {
      root?.render(
        <Harness
          open={true}
          onOpenChange={onOpenChange}
          editPresetId="ocean-glow"
        />,
      );
    });
    expect(latestState?.draft?.name).toBe('Ocean Glow');
    expect(latestState?.tab).toBe('colors');

    await act(async () => {
      root?.render(<Harness open={false} onOpenChange={onOpenChange} editPresetId="ocean-glow" />);
    });
    expect(latestState?.draft).toBeNull();
  });

  it('applies live preview changes and reverts them on cancel', async () => {
    await act(async () => {
      root?.render(<Harness open={true} onOpenChange={onOpenChange} editPresetId="ocean-glow" />);
    });

    act(() => {
      latestState?.handleColorChange('bgBase', '#123456');
    });
    expect(document.documentElement.style.getPropertyValue('--bg-base')).toBe('#123456');

    act(() => {
      latestState?.handleCancel();
    });
    expect(onOpenChangeSpy).toHaveBeenCalledWith(false);
    expect(latestState?.draft).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--bg-base')).toBe('#08111f');
  });

  it('saves the current draft as a preset and closes the sheet', async () => {
    await act(async () => {
      root?.render(<Harness open={true} onOpenChange={onOpenChange} editPresetId="ocean-glow" />);
    });

    act(() => {
      latestState?.handleDraftNameChange('Ocean Glow Redux');
    });

    await act(async () => {
      await latestState?.handleSave();
    });

    expect(saveCustomPresetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ocean-glow-redux',
        name: 'Ocean Glow Redux',
      }),
    );
    expect(setPresetSpy).toHaveBeenCalledWith('ocean-glow-redux');
    expect(onOpenChangeSpy).toHaveBeenCalledWith(false);
    expect(latestState?.draft).toBeNull();
  });

  it('previews and saves desktop glass controls with the theme', async () => {
    await act(async () => {
      root?.render(<Harness open={true} onOpenChange={onOpenChange} editPresetId="ocean-glow" />);
    });

    act(() => {
      latestState?.handleGlassChange({
        enabled: true,
        opacity: 0.62,
        blurRadius: 32, windowsMaterial: 'acrylic',
        sidebarOpacity: 0,
        surfaceOpacity: 0.12,
        selectionOpacity: 0.15,
        borderOpacity: 0.2,
      });
    });

    expect(document.documentElement.classList.contains('theme-glass')).toBe(
      true,
    );
    expect(document.documentElement.style.getPropertyValue('--bg-base')).toBe(
      'color-mix(in srgb, #08111f 62%, transparent)',
    );

    await act(async () => {
      await latestState?.handleSave();
    });

    expect(saveCustomPresetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        glass: { enabled: true, opacity: 0.62, blurRadius: 32, windowsMaterial: 'acrylic',
          sidebarOpacity: 0, surfaceOpacity: 0.12, selectionOpacity: 0.15, borderOpacity: 0.2 },
      }),
    );
  });

  it('debounces auto-save draft changes and persists the latest draft', async () => {
    vi.useFakeTimers();
    await act(async () => {
      root?.render(<Harness open={true} onOpenChange={onOpenChange} editPresetId="ocean-glow" />);
    });

    act(() => {
      latestState?.setAutoSave(true);
    });

    act(() => {
      latestState?.handleColorChange('bgBase', '#123456');
      latestState?.handleColorChange('bgBase', '#234567');
      latestState?.handleColorChange('bgBase', '#345678');
    });

    expect(saveCustomPresetSpy).not.toHaveBeenCalled();

    await advanceTimers(450);

    expect(saveCustomPresetSpy).toHaveBeenCalledTimes(1);
    expect(saveCustomPresetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ocean-glow',
        colors: expect.objectContaining({
          dark: expect.objectContaining({ bgBase: '#345678' }),
        }),
      }),
    );
    expect(setPresetSpy).toHaveBeenCalledWith('ocean-glow');
  });

  it('persists the auto-save preference to layout state', async () => {
    vi.useFakeTimers();
    await act(async () => {
      root?.render(<Harness open={true} onOpenChange={onOpenChange} editPresetId="ocean-glow" />);
    });

    act(() => {
      latestState?.setAutoSave(true);
    });

    await advanceTimers(100);

    expect(saveLayoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({ themeEditorAutoSave: true }),
    );
  });

  it('retries the latest debounced auto-save after a transient failure', async () => {
    saveCustomPresetSpy
      .mockRejectedValueOnce(new Error('disk busy'))
      .mockResolvedValue(undefined);

    vi.useFakeTimers();
    await act(async () => {
      root?.render(<Harness open={true} onOpenChange={onOpenChange} editPresetId="ocean-glow" />);
    });

    act(() => {
      latestState?.setAutoSave(true);
    });

    act(() => {
      latestState?.handleColorChange('bgBase', '#456789');
    });

    await advanceTimers(450);

    expect(saveCustomPresetSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[theme-editor] Failed to auto-save theme draft:',
      expect.any(Error),
    );

    await advanceTimers(450);

    expect(saveCustomPresetSpy).toHaveBeenCalledTimes(2);
    expect(saveCustomPresetSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        colors: expect.objectContaining({
          dark: expect.objectContaining({ bgBase: '#456789' }),
        }),
      }),
    );
  });

  it('keeps auto-saved changes when the editor is explicitly closed', async () => {
    await act(async () => {
      root?.render(<Harness open={true} onOpenChange={onOpenChange} editPresetId="ocean-glow" />);
    });

    act(() => {
      latestState?.setAutoSave(true);
    });

    act(() => {
      latestState?.handleColorChange('bgBase', '#123456');
      latestState?.handleCancel();
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onOpenChangeSpy).toHaveBeenCalledWith(false);
    expect(saveCustomPresetSpy).toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue('--bg-base')).toBe('#123456');
  });

  it('reloads the built-in preset template on reset and reapplies preview', async () => {
    await act(async () => {
      root?.render(<Harness open={true} onOpenChange={onOpenChange} editPresetId="ocean-glow" />);
    });

    act(() => {
      latestState?.handleColorChange('bgBase', '#111111');
    });
    expect(document.documentElement.style.getPropertyValue('--bg-base')).toBe('#111111');

    await act(async () => {
      await latestState?.handleReset();
    });

    expect(resetThemePresetSpy).toHaveBeenCalledWith('ocean-glow');
    expect(latestState?.draft?.name).toBe('Restored Ocean Glow');
    expect(document.documentElement.style.getPropertyValue('--bg-base')).toBe('#020814');
  });
});
