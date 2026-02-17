import { create } from 'zustand';
import type {
  SessionContext,
  ContextOverrides,
  ContextToolInfo,
  ContextSkillInfo,
} from '@/types/ipc';

// ── Preset Types ──────────────────────────────────────────────

export interface ContextPreset {
  id: string;
  name: string;
  /** If null, use the default system prompt. If string, override with this. */
  systemPrompt: string | null;
  /** Tool names to disable. */
  disabledTools: string[];
  /** Skill names to disable. */
  disabledSkills: string[];
}

const PRESETS_STORAGE_KEY = 'sero:context-editor:presets';

// ── Built-in Presets ──────────────────────────────────────────

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

// ── Store Types ───────────────────────────────────────────────

interface ContextEditorState {
  /** Whether the context editor dialog is open. */
  isOpen: boolean;

  /** Available context fetched from the session (null = not loaded). */
  availableContext: SessionContext | null;

  /** Current override state being edited. */
  systemPrompt: string | null;
  disabledTools: Set<string>;
  disabledSkills: Set<string>;
  /** Whether '__all__' tools/skills are disabled (the "none" pattern). */
  allToolsDisabled: boolean;
  allSkillsDisabled: boolean;

  /** Currently selected preset ID (or null for custom). */
  activePresetId: string | null;

  /** User-saved presets (loaded from localStorage). */
  userPresets: ContextPreset[];

  // ── Actions ─────────────────────────────────────────────────

  open: (sessionId: string) => Promise<void>;
  close: () => void;

  setSystemPrompt: (value: string | null) => void;
  toggleTool: (toolName: string) => void;
  toggleSkill: (skillName: string) => void;
  setAllToolsDisabled: (disabled: boolean) => void;
  setAllSkillsDisabled: (disabled: boolean) => void;

  /** Apply the current overrides to the session. */
  apply: (sessionId: string) => Promise<void>;
  /** Reset to default (clear all overrides). */
  resetToDefault: () => void;

  /** Load a preset into the editor state. */
  loadPreset: (presetId: string) => void;
  /** Save the current editor state as a new preset. */
  savePreset: (name: string) => void;
  /** Delete a user preset. */
  deletePreset: (presetId: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────

function loadUserPresets(): ContextPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Ignore parse errors
  }
  return [];
}

function saveUserPresets(presets: ContextPreset[]): void {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

// ── Store ─────────────────────────────────────────────────────

export const useContextEditorStore = create<ContextEditorState>((set, get) => ({
  isOpen: false,
  availableContext: null,
  systemPrompt: null,
  disabledTools: new Set(),
  disabledSkills: new Set(),
  allToolsDisabled: false,
  allSkillsDisabled: false,
  activePresetId: '__default__',
  userPresets: loadUserPresets(),

  open: async (sessionId) => {
    set({ isOpen: true, availableContext: null });

    try {
      const context = await window.sero.agent.getContext(sessionId);
      if (context) {
        set({ availableContext: context });
      }
    } catch (err) {
      console.error('[context-editor] Failed to load context:', err);
    }
  },

  close: () => {
    set({ isOpen: false });
  },

  setSystemPrompt: (value) => {
    set({ systemPrompt: value, activePresetId: null });
  },

  toggleTool: (toolName) => {
    const { disabledTools, allToolsDisabled } = get();
    const next = new Set(disabledTools);
    if (next.has(toolName)) {
      next.delete(toolName);
    } else {
      next.add(toolName);
    }
    set({
      disabledTools: next,
      allToolsDisabled: false,
      activePresetId: null,
    });
  },

  toggleSkill: (skillName) => {
    const { disabledSkills, allSkillsDisabled } = get();
    const next = new Set(disabledSkills);
    if (next.has(skillName)) {
      next.delete(skillName);
    } else {
      next.add(skillName);
    }
    set({
      disabledSkills: next,
      allSkillsDisabled: false,
      activePresetId: null,
    });
  },

  setAllToolsDisabled: (disabled) => {
    set({
      allToolsDisabled: disabled,
      disabledTools: new Set(),
      activePresetId: null,
    });
  },

  setAllSkillsDisabled: (disabled) => {
    set({
      allSkillsDisabled: disabled,
      disabledSkills: new Set(),
      activePresetId: null,
    });
  },

  apply: async (sessionId) => {
    const { systemPrompt, disabledTools, allToolsDisabled, disabledSkills, allSkillsDisabled, availableContext } = get();

    // Build the overrides to send to main process
    let toolsToDisable: string[] = [];
    if (allToolsDisabled && availableContext) {
      toolsToDisable = availableContext.tools.map((t) => t.name);
    } else {
      toolsToDisable = Array.from(disabledTools);
    }

    let skillsToDisable: string[] = [];
    if (allSkillsDisabled && availableContext) {
      skillsToDisable = availableContext.skills.map((s) => s.name);
    } else {
      skillsToDisable = Array.from(disabledSkills);
    }

    const hasOverrides =
      systemPrompt !== null ||
      toolsToDisable.length > 0 ||
      skillsToDisable.length > 0;

    const overrides: ContextOverrides | null = hasOverrides
      ? {
          systemPrompt: systemPrompt ?? undefined,
          disabledTools: toolsToDisable.length > 0 ? toolsToDisable : undefined,
          disabledSkills: skillsToDisable.length > 0 ? skillsToDisable : undefined,
        }
      : null;

    try {
      await window.sero.agent.setContextOverrides(sessionId, overrides);
    } catch (err) {
      console.error('[context-editor] Failed to apply overrides:', err);
    }
  },

  resetToDefault: () => {
    set({
      systemPrompt: null,
      disabledTools: new Set(),
      disabledSkills: new Set(),
      allToolsDisabled: false,
      allSkillsDisabled: false,
      activePresetId: '__default__',
    });
  },

  loadPreset: (presetId) => {
    const allPresets = [...BUILTIN_PRESETS, ...get().userPresets];
    const preset = allPresets.find((p) => p.id === presetId);
    if (!preset) return;

    const allToolsDisabled = preset.disabledTools.includes('__all__');
    const allSkillsDisabled = preset.disabledSkills.includes('__all__');

    set({
      systemPrompt: preset.systemPrompt,
      disabledTools: new Set(allToolsDisabled ? [] : preset.disabledTools),
      disabledSkills: new Set(allSkillsDisabled ? [] : preset.disabledSkills),
      allToolsDisabled,
      allSkillsDisabled,
      activePresetId: presetId,
    });
  },

  savePreset: (name) => {
    const { systemPrompt, disabledTools, disabledSkills, allToolsDisabled, allSkillsDisabled, userPresets } = get();

    const newPreset: ContextPreset = {
      id: `user-${Date.now()}`,
      name,
      systemPrompt,
      disabledTools: allToolsDisabled ? ['__all__'] : Array.from(disabledTools),
      disabledSkills: allSkillsDisabled ? ['__all__'] : Array.from(disabledSkills),
    };

    const updated = [...userPresets, newPreset];
    saveUserPresets(updated);
    set({ userPresets: updated, activePresetId: newPreset.id });
  },

  deletePreset: (presetId) => {
    const { userPresets, activePresetId } = get();
    const updated = userPresets.filter((p) => p.id !== presetId);
    saveUserPresets(updated);
    set({
      userPresets: updated,
      activePresetId: activePresetId === presetId ? null : activePresetId,
    });
  },
}));

// ── Selectors ─────────────────────────────────────────────────

/** All available presets (built-in + user). */
export function useAllPresets(): ContextPreset[] {
  const userPresets = useContextEditorStore((s) => s.userPresets);
  return [...BUILTIN_PRESETS, ...userPresets];
}

/** Check if a tool is enabled in the current editor state. */
export function useIsToolEnabled(toolName: string): boolean {
  const disabledTools = useContextEditorStore((s) => s.disabledTools);
  const allDisabled = useContextEditorStore((s) => s.allToolsDisabled);
  if (allDisabled) return false;
  return !disabledTools.has(toolName);
}

/** Check if a skill is enabled in the current editor state. */
export function useIsSkillEnabled(skillName: string): boolean {
  const disabledSkills = useContextEditorStore((s) => s.disabledSkills);
  const allDisabled = useContextEditorStore((s) => s.allSkillsDisabled);
  if (allDisabled) return false;
  return !disabledSkills.has(skillName);
}

/** Whether the current state has any overrides from the default. */
export function useHasOverrides(): boolean {
  const systemPrompt = useContextEditorStore((s) => s.systemPrompt);
  const disabledTools = useContextEditorStore((s) => s.disabledTools);
  const disabledSkills = useContextEditorStore((s) => s.disabledSkills);
  const allToolsDisabled = useContextEditorStore((s) => s.allToolsDisabled);
  const allSkillsDisabled = useContextEditorStore((s) => s.allSkillsDisabled);
  return (
    systemPrompt !== null ||
    disabledTools.size > 0 ||
    disabledSkills.size > 0 ||
    allToolsDisabled ||
    allSkillsDisabled
  );
}
