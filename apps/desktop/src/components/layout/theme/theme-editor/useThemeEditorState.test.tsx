// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTheme } from '@/lib/theme-engine';
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
  const setPresetSpy = vi.fn<(id: string) => Promise<void>>();
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
    setPresetSpy.mockReset();
    resetPreset = createPreset({
      name: 'Restored Ocean Glow',
      colors: {
        light: { ...DEFAULT_LIGHT_COLORS, bgBase: '#f8fbff' },
        dark: { ...DEFAULT_DARK_COLORS, bgBase: '#020814', accentPrimary: '#55bbff' },
      },
    });
    resetThemePresetSpy.mockImplementation(async () => resetPreset);
    saveCustomPresetSpy.mockImplementation(async () => {});
    setPresetSpy.mockImplementation(async () => {});

    useThemeStore.setState(initialThemeState, true);
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
        themes: mockThemes,
      } satisfies Pick<typeof window.sero, 'themes'>,
    });

    resetTheme();
    document.documentElement.classList.remove('dark');
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
    Reflect.deleteProperty(window, 'sero');
    resetTheme();
    document.documentElement.classList.remove('dark');
    useThemeStore.setState(initialThemeState, true);
  });

  it('initializes draft when the sheet opens and clears it when it closes', async () => {
    await act(async () => {
      root?.render(<Harness open={false} onOpenChange={onOpenChange} editPresetId="ocean-glow" />);
    });
    expect(latestState?.draft).toBeNull();

    await act(async () => {
      root?.render(<Harness open={true} onOpenChange={onOpenChange} editPresetId="ocean-glow" />);
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
