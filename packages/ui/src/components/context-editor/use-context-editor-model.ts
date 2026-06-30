/**
 * useContextEditorModel — the controlled editing state for the ContextEditor.
 *
 * Holds the working overrides (system prompt, disabled tools/skills, preset
 * selection) and all the toggle/normalize/preset logic, seeded from the
 * `available` context and `initialOverrides`. Host-agnostic: persistence
 * (apply / save preset / delete preset) is injected by the consumer, so the
 * chat session editor and an app module (e.g. an Orchestrator loop) share one
 * implementation.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AvailableContext,
  ContextOverrides,
  ContextPreset,
  ContextSkillInfo,
  ContextToolInfo,
} from '@sero-ai/common';

const NONE_PRESET: ContextPreset = {
  id: '__none__',
  name: 'None',
  systemPrompt: '',
  disabledTools: ['__all__'],
  disabledSkills: ['__all__'],
};

const DEFAULT_PRESET: ContextPreset = {
  id: '__default__',
  name: 'Default',
  systemPrompt: null,
  disabledTools: [],
  disabledSkills: [],
};

const BUILTIN_PRESETS: ContextPreset[] = [DEFAULT_PRESET, NONE_PRESET];

function normalizeDisabledNames(names: string[] | undefined, availableNames: string[]): Set<string> {
  const allowed = new Set(availableNames);
  return new Set((names ?? []).filter((name) => allowed.has(name)));
}

function appliedSystemPrompt(overrides: ContextOverrides | null): string | null {
  if (!overrides || !Object.prototype.hasOwnProperty.call(overrides, 'systemPrompt')) return null;
  return typeof overrides.systemPrompt === 'string' ? overrides.systemPrompt : null;
}

function enabledCount<TItem extends ContextToolInfo | ContextSkillInfo>(
  items: TItem[],
  disabled: Set<string>,
  allDisabled: boolean,
): number {
  if (allDisabled) return 0;
  return items.filter((item) => !disabled.has(item.name)).length;
}

/** The persistable body of a preset (id assigned by the consumer). */
export type ContextPresetBody = Pick<ContextPreset, 'systemPrompt' | 'disabledTools' | 'disabledSkills'>;

interface CapabilityState<TItem extends ContextToolInfo | ContextSkillInfo> {
  items: TItem[];
  allDisabled: boolean;
  enabledCount: number;
  isEnabled: (name: string) => boolean;
  onToggle: (name: string) => void;
  onToggleAll: (disabled: boolean) => void;
}

export interface ContextEditorModel {
  displayedPrompt: string;
  systemPrompt: string | null;
  setSystemPrompt: (value: string | null) => void;
  preset: {
    allPresets: ContextPreset[];
    activePresetId: string | null;
    activeUserPreset: ContextPreset | null;
    hasOverrides: boolean;
    showSaveInput: boolean;
    onPresetChange: (id: string) => void;
    onDelete: (id: string) => void;
    onReset: () => void;
    onShowSave: () => void;
    onSave: (name: string) => void;
    onCancelSave: () => void;
  };
  tools: CapabilityState<ContextToolInfo>;
  skills: CapabilityState<ContextSkillInfo>;
  /** Build the overrides to persist, or null when nothing is overridden. */
  buildOverrides: () => ContextOverrides | null;
}

export interface UseContextEditorModelParams {
  /** Whether the editor is open — drives one-time seeding per open. */
  open: boolean;
  available: AvailableContext | null;
  initialOverrides: ContextOverrides | null;
  presets: ContextPreset[];
  onSavePreset: (name: string, preset: ContextPresetBody) => void;
  onDeletePreset: (id: string) => void;
}

export function useContextEditorModel({
  open,
  available,
  initialOverrides,
  presets,
  onSavePreset,
  onDeletePreset,
}: UseContextEditorModelParams): ContextEditorModel {
  const [systemPrompt, setSystemPromptState] = useState<string | null>(null);
  const [disabledTools, setDisabledTools] = useState<Set<string>>(new Set());
  const [disabledSkills, setDisabledSkills] = useState<Set<string>>(new Set());
  const [allToolsDisabled, setAllToolsDisabled] = useState(false);
  const [allSkillsDisabled, setAllSkillsDisabled] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>('__default__');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const tools = available?.tools ?? [];
  const skills = available?.skills ?? [];

  // Seed once per open, after the available context has loaded, so the editor
  // reflects the target's current overrides without clobbering live edits.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!open) {
      seededRef.current = false;
      return;
    }
    if (seededRef.current || !available) return;
    seededRef.current = true;

    const seedDisabledTools = normalizeDisabledNames(
      initialOverrides?.disabledTools,
      available.tools.map((t) => t.name),
    );
    const seedDisabledSkills = normalizeDisabledNames(
      initialOverrides?.disabledSkills,
      available.skills.map((s) => s.name),
    );
    const allTools = available.tools.length > 0 && seedDisabledTools.size >= available.tools.length;
    const allSkills = available.skills.length > 0 && seedDisabledSkills.size >= available.skills.length;

    setSystemPromptState(appliedSystemPrompt(initialOverrides));
    setDisabledTools(allTools ? new Set() : seedDisabledTools);
    setDisabledSkills(allSkills ? new Set() : seedDisabledSkills);
    setAllToolsDisabled(allTools);
    setAllSkillsDisabled(allSkills);
    setActivePresetId(initialOverrides ? null : '__default__');
    setShowSaveInput(false);
  }, [open, available, initialOverrides]);

  const setSystemPrompt = useCallback((value: string | null) => {
    setSystemPromptState(value);
    setActivePresetId(null);
  }, []);

  const toggleCapability = useCallback(
    (
      name: string,
      items: { name: string }[],
      disabled: Set<string>,
      allDisabled: boolean,
      setDisabled: (s: Set<string>) => void,
      setAll: (b: boolean) => void,
    ) => {
      let next: Set<string>;
      if (allDisabled) {
        next = new Set(items.map((i) => i.name));
        next.delete(name);
      } else {
        next = new Set(disabled);
        if (next.has(name)) next.delete(name);
        else next.add(name);
      }
      const total = items.length;
      const allNowDisabled = total > 0 && next.size >= total;
      setDisabled(allNowDisabled ? new Set() : next);
      setAll(allNowDisabled);
      setActivePresetId(null);
    },
    [],
  );

  const loadPreset = useCallback(
    (presetId: string) => {
      const all = [...BUILTIN_PRESETS, ...presets];
      const preset = all.find((p) => p.id === presetId);
      if (!preset) return;
      const allTools = preset.disabledTools.includes('__all__');
      const allSkills = preset.disabledSkills.includes('__all__');
      setSystemPromptState(preset.systemPrompt);
      setDisabledTools(new Set(allTools ? [] : preset.disabledTools));
      setDisabledSkills(new Set(allSkills ? [] : preset.disabledSkills));
      setAllToolsDisabled(allTools);
      setAllSkillsDisabled(allSkills);
      setActivePresetId(presetId);
    },
    [presets],
  );

  const resetToDefault = useCallback(() => {
    setSystemPromptState(null);
    setDisabledTools(new Set());
    setDisabledSkills(new Set());
    setAllToolsDisabled(false);
    setAllSkillsDisabled(false);
    setActivePresetId('__default__');
    setShowSaveInput(false);
  }, []);

  const buildOverrides = useCallback((): ContextOverrides | null => {
    const toolsToDisable = allToolsDisabled ? tools.map((t) => t.name) : Array.from(disabledTools);
    const skillsToDisable = allSkillsDisabled ? skills.map((s) => s.name) : Array.from(disabledSkills);
    const has = systemPrompt !== null || toolsToDisable.length > 0 || skillsToDisable.length > 0;
    if (!has) return null;
    return {
      systemPrompt: systemPrompt ?? undefined,
      disabledTools: toolsToDisable.length > 0 ? toolsToDisable : undefined,
      disabledSkills: skillsToDisable.length > 0 ? skillsToDisable : undefined,
    };
  }, [allToolsDisabled, allSkillsDisabled, tools, skills, disabledTools, disabledSkills, systemPrompt]);

  const handleSavePreset = useCallback(
    (name: string) => {
      onSavePreset(name, {
        systemPrompt,
        disabledTools: allToolsDisabled ? ['__all__'] : Array.from(disabledTools),
        disabledSkills: allSkillsDisabled ? ['__all__'] : Array.from(disabledSkills),
      });
      setShowSaveInput(false);
    },
    [onSavePreset, systemPrompt, allToolsDisabled, disabledTools, allSkillsDisabled, disabledSkills],
  );

  const allPresets = useMemo(() => [...BUILTIN_PRESETS, ...presets], [presets]);
  const activeUserPreset = useMemo(
    () =>
      activePresetId && !activePresetId.startsWith('__')
        ? allPresets.find((p) => p.id === activePresetId) ?? null
        : null,
    [activePresetId, allPresets],
  );
  const hasOverrides =
    systemPrompt !== null ||
    disabledTools.size > 0 ||
    disabledSkills.size > 0 ||
    allToolsDisabled ||
    allSkillsDisabled;

  return {
    displayedPrompt: systemPrompt ?? available?.systemPrompt ?? '',
    systemPrompt,
    setSystemPrompt,
    preset: {
      allPresets,
      activePresetId,
      activeUserPreset,
      hasOverrides,
      showSaveInput,
      onPresetChange: loadPreset,
      onDelete: onDeletePreset,
      onReset: resetToDefault,
      onShowSave: () => setShowSaveInput(true),
      onSave: handleSavePreset,
      onCancelSave: () => setShowSaveInput(false),
    },
    tools: {
      items: tools,
      allDisabled: allToolsDisabled,
      enabledCount: enabledCount(tools, disabledTools, allToolsDisabled),
      isEnabled: (name) => !allToolsDisabled && !disabledTools.has(name),
      onToggle: (name) =>
        toggleCapability(name, tools, disabledTools, allToolsDisabled, setDisabledTools, setAllToolsDisabled),
      onToggleAll: (disabled) => {
        setAllToolsDisabled(disabled);
        setDisabledTools(new Set());
        setActivePresetId(null);
      },
    },
    skills: {
      items: skills,
      allDisabled: allSkillsDisabled,
      enabledCount: enabledCount(skills, disabledSkills, allSkillsDisabled),
      isEnabled: (name) => !allSkillsDisabled && !disabledSkills.has(name),
      onToggle: (name) =>
        toggleCapability(name, skills, disabledSkills, allSkillsDisabled, setDisabledSkills, setAllSkillsDisabled),
      onToggleAll: (disabled) => {
        setAllSkillsDisabled(disabled);
        setDisabledSkills(new Set());
        setActivePresetId(null);
      },
    },
    buildOverrides,
  };
}
