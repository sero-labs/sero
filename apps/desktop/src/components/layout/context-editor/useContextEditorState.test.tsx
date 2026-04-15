// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextPreset, SessionContext } from '@/types/ipc';
import { useContextEditorState } from './useContextEditorState';

const closeSpy = vi.fn<() => void>();
const setSystemPromptSpy = vi.fn<(value: string | null) => void>();
const toggleToolSpy = vi.fn<(name: string) => void>();
const toggleSkillSpy = vi.fn<(name: string) => void>();
const setAllToolsDisabledSpy = vi.fn<(disabled: boolean) => void>();
const setAllSkillsDisabledSpy = vi.fn<(disabled: boolean) => void>();
const applySpy = vi.fn<(sessionId: string) => Promise<boolean>>();
const resetToDefaultSpy = vi.fn<() => void>();
const loadPresetSpy = vi.fn<(presetId: string) => void>();
const savePresetSpy = vi.fn<(name: string) => Promise<void>>();
const deletePresetSpy = vi.fn<(presetId: string) => Promise<void>>();

const baseContext: SessionContext = {
  systemPrompt: 'Default session prompt',
  tools: [
    { name: 'search', description: 'Search docs' },
    { name: 'write', description: 'Write files' },
  ],
  skills: [
    { name: 'deslopify', description: 'Review module quality' },
    { name: 'fix-slop', description: 'Apply plan fixes' },
  ],
  overrides: null,
};

const presets: ContextPreset[] = [
  {
    id: '__default__',
    name: 'Default',
    systemPrompt: null,
    disabledTools: [],
    disabledSkills: [],
  },
  {
    id: 'user-team',
    name: 'Team preset',
    systemPrompt: 'Team prompt',
    disabledTools: ['write'],
    disabledSkills: [],
  },
];

let hasOverrides = true;
let editorState = {
  isOpen: true,
  availableContext: baseContext,
  systemPrompt: null as string | null,
  disabledTools: new Set(['write']),
  disabledSkills: new Set(['fix-slop']),
  allToolsDisabled: false,
  allSkillsDisabled: false,
  activePresetId: 'user-team' as string | null,
  applyError: null as string | null,
};

const editorActions = {
  close: closeSpy,
  setSystemPrompt: setSystemPromptSpy,
  toggleTool: toggleToolSpy,
  toggleSkill: toggleSkillSpy,
  setAllToolsDisabled: setAllToolsDisabledSpy,
  setAllSkillsDisabled: setAllSkillsDisabledSpy,
  apply: applySpy,
  resetToDefault: resetToDefaultSpy,
  loadPreset: loadPresetSpy,
  savePreset: savePresetSpy,
  deletePreset: deletePresetSpy,
};

vi.mock('@/stores/context-editor', () => ({
  useAllPresets: () => presets,
  useHasOverrides: () => hasOverrides,
  useEditorState: () => editorState,
  useEditorActions: () => editorActions,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  latestState = useContextEditorState('session-123');
  return null;
}

let latestState: ReturnType<typeof useContextEditorState> | null = null;

describe('useContextEditorState', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    latestState = null;
    hasOverrides = true;
    editorState = {
      isOpen: true,
      availableContext: baseContext,
      systemPrompt: null,
      disabledTools: new Set(['write']),
      disabledSkills: new Set(['fix-slop']),
      allToolsDisabled: false,
      allSkillsDisabled: false,
      activePresetId: 'user-team',
      applyError: null,
    };
    closeSpy.mockReset();
    setSystemPromptSpy.mockReset();
    toggleToolSpy.mockReset();
    toggleSkillSpy.mockReset();
    setAllToolsDisabledSpy.mockReset();
    setAllSkillsDisabledSpy.mockReset();
    applySpy.mockReset();
    resetToDefaultSpy.mockReset();
    loadPresetSpy.mockReset();
    savePresetSpy.mockReset();
    deletePresetSpy.mockReset();
    applySpy.mockResolvedValue(true);
    savePresetSpy.mockResolvedValue(undefined);
    deletePresetSpy.mockResolvedValue(undefined);
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
  });

  it('derives preset metadata, prompt fallback, and enabled counts from store state', async () => {
    await act(async () => {
      root?.render(<Harness />);
    });

    expect(latestState?.displayedPrompt).toBe('Default session prompt');
    expect(latestState?.preset.activeUserPreset).toEqual(
      expect.objectContaining({ id: 'user-team', name: 'Team preset' }),
    );
    expect(latestState?.preset.hasOverrides).toBe(true);
    expect(latestState?.tools.enabledCount).toBe(1);
    expect(latestState?.tools.isEnabled('search')).toBe(true);
    expect(latestState?.tools.isEnabled('write')).toBe(false);
    expect(latestState?.skills.enabledCount).toBe(1);
    expect(latestState?.skills.isEnabled('deslopify')).toBe(true);
    expect(latestState?.skills.isEnabled('fix-slop')).toBe(false);
  });

  it('uses explicit prompt overrides and hides the save input again after saving', async () => {
    editorState = {
      ...editorState,
      systemPrompt: 'Custom prompt',
      activePresetId: null,
    };

    await act(async () => {
      root?.render(<Harness />);
    });

    expect(latestState?.displayedPrompt).toBe('Custom prompt');
    expect(latestState?.preset.showSaveInput).toBe(false);

    act(() => {
      latestState?.preset.onShowSave();
    });
    expect(latestState?.preset.showSaveInput).toBe(true);

    act(() => {
      latestState?.preset.onSave('Snapshot');
    });

    expect(savePresetSpy).toHaveBeenCalledWith('Snapshot');
    expect(latestState?.preset.showSaveInput).toBe(false);
  });

  it('only closes the dialog when apply succeeds', async () => {
    await act(async () => {
      root?.render(<Harness />);
    });

    applySpy.mockResolvedValueOnce(false);
    await act(async () => {
      await latestState?.handleApplyAndClose();
    });

    expect(applySpy).toHaveBeenCalledWith('session-123');
    expect(closeSpy).not.toHaveBeenCalled();

    applySpy.mockResolvedValueOnce(true);
    await act(async () => {
      await latestState?.handleApplyAndClose();
    });

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
