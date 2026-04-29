import { useCallback, useMemo, useState } from 'react';
import {
  useAllPresets,
  useHasOverrides,
  useEditorState,
  useEditorActions,
} from '@/stores/context-editor';
import type {
  ContextPreset,
  ContextSkillInfo,
  ContextToolInfo,
} from '@/types/ipc';

interface ContextCapabilityState<TItem extends ContextToolInfo | ContextSkillInfo> {
  items: TItem[];
  allDisabled: boolean;
  enabledCount: number;
  isEnabled: (name: string) => boolean;
}

interface ContextEditorPresetState {
  allPresets: ContextPreset[];
  activePresetId: string | null;
  activeUserPreset: ContextPreset | null;
  hasOverrides: boolean;
  showSaveInput: boolean;
  onPresetChange: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onReset: () => void;
  onShowSave: () => void;
  onSave: (name: string) => void;
  onCancelSave: () => void;
}

export interface ContextEditorViewState {
  isOpen: boolean;
  close: () => void;
  availableContext: ReturnType<typeof useEditorState>['availableContext'];
  applyError: string | null;
  displayedPrompt: string;
  systemPrompt: string | null;
  setSystemPrompt: (value: string | null) => void;
  preset: ContextEditorPresetState;
  tools: ContextCapabilityState<ContextToolInfo> & {
    onToggle: (name: string) => void;
    onToggleAll: (disabled: boolean) => void;
  };
  skills: ContextCapabilityState<ContextSkillInfo> & {
    onToggle: (name: string) => void;
    onToggleAll: (disabled: boolean) => void;
  };
  handleApplyAndClose: () => Promise<void>;
}

function getEnabledCount<TItem extends ContextToolInfo | ContextSkillInfo>(
  items: TItem[],
  disabledNames: Set<string>,
  allDisabled: boolean,
): number {
  if (allDisabled) {
    return 0;
  }

  return items.filter((item) => !disabledNames.has(item.name)).length;
}

export function useContextEditorState(sessionId: string): ContextEditorViewState {
  const state = useEditorState();
  const actions = useEditorActions();
  const allPresets = useAllPresets();
  const hasOverrides = useHasOverrides();
  const [showSaveInput, setShowSaveInput] = useState(false);

  const {
    isOpen,
    availableContext,
    systemPrompt,
    disabledTools,
    disabledSkills,
    allToolsDisabled,
    allSkillsDisabled,
    activePresetId,
    applyError,
  } = state;

  const {
    close,
    setSystemPrompt,
    toggleTool,
    toggleSkill,
    setAllToolsDisabled,
    setAllSkillsDisabled,
    apply,
    resetToDefault,
    loadPreset,
    savePreset,
    deletePreset,
  } = actions;

  const displayedPrompt = systemPrompt ?? availableContext?.systemPrompt ?? '';

  const isToolEnabled = useCallback(
    (toolName: string) => !allToolsDisabled && !disabledTools.has(toolName),
    [allToolsDisabled, disabledTools],
  );

  const isSkillEnabled = useCallback(
    (skillName: string) => !allSkillsDisabled && !disabledSkills.has(skillName),
    [allSkillsDisabled, disabledSkills],
  );

  const enabledToolCount = useMemo(
    () => getEnabledCount(availableContext?.tools ?? [], disabledTools, allToolsDisabled),
    [availableContext?.tools, allToolsDisabled, disabledTools],
  );

  const enabledSkillCount = useMemo(
    () => getEnabledCount(availableContext?.skills ?? [], disabledSkills, allSkillsDisabled),
    [availableContext?.skills, allSkillsDisabled, disabledSkills],
  );

  const handleApplyAndClose = useCallback(async () => {
    const ok = await apply(sessionId);
    if (ok) {
      close();
    }
  }, [apply, close, sessionId]);

  const handleShowSave = useCallback(() => {
    setShowSaveInput(true);
  }, []);

  const handleCancelSave = useCallback(() => {
    setShowSaveInput(false);
  }, []);

  const handleSavePreset = useCallback(
    (name: string) => {
      void savePreset(name);
      setShowSaveInput(false);
    },
    [savePreset],
  );

  const activeUserPreset = useMemo(
    () =>
      activePresetId && !activePresetId.startsWith('__')
        ? allPresets.find((preset) => preset.id === activePresetId) ?? null
        : null,
    [activePresetId, allPresets],
  );

  return {
    isOpen,
    close,
    availableContext,
    applyError,
    displayedPrompt,
    systemPrompt,
    setSystemPrompt,
    preset: {
      allPresets,
      activePresetId,
      activeUserPreset,
      hasOverrides,
      showSaveInput,
      onPresetChange: loadPreset,
      onDelete: deletePreset,
      onReset: resetToDefault,
      onShowSave: handleShowSave,
      onSave: handleSavePreset,
      onCancelSave: handleCancelSave,
    },
    tools: {
      items: availableContext?.tools ?? [],
      allDisabled: allToolsDisabled,
      enabledCount: enabledToolCount,
      isEnabled: isToolEnabled,
      onToggle: toggleTool,
      onToggleAll: setAllToolsDisabled,
    },
    skills: {
      items: availableContext?.skills ?? [],
      allDisabled: allSkillsDisabled,
      enabledCount: enabledSkillCount,
      isEnabled: isSkillEnabled,
      onToggle: toggleSkill,
      onToggleAll: setAllSkillsDisabled,
    },
    handleApplyAndClose,
  };
}
