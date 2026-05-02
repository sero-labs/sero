import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type {
  SessionContext,
  ContextOverrides,
  ContextPreset,
} from '@/types/ipc';

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

function normalizeDisabledNames(
  names: string[] | undefined,
  availableNames: string[],
): Set<string> {
  const allowed = new Set(availableNames);
  return new Set((names ?? []).filter((name) => allowed.has(name)));
}

function getAppliedSystemPrompt(overrides: ContextOverrides | null): string | null {
  if (!overrides || !Object.prototype.hasOwnProperty.call(overrides, 'systemPrompt')) {
    return null;
  }
  return typeof overrides.systemPrompt === 'string' ? overrides.systemPrompt : '';
}

// ── Store Types ───────────────────────────────────────────────

interface ContextEditorState {
  isOpen: boolean;
  loadedSessionId: string | null;
  availableContext: SessionContext | null;

  systemPrompt: string | null;
  disabledTools: Set<string>;
  disabledSkills: Set<string>;
  allToolsDisabled: boolean;
  allSkillsDisabled: boolean;

  activePresetId: string | null;
  /** User-saved presets (persisted to disk via IPC). */
  userPresets: ContextPreset[];
  /** Whether user presets have been loaded from disk. */
  presetsLoaded: boolean;

  /** Error message from the last apply() call, or null. */
  applyError: string | null;

  // ── Actions ─────────────────────────────────────────────────

  open: (sessionId: string) => Promise<void>;
  close: () => void;

  setSystemPrompt: (value: string | null) => void;
  toggleTool: (toolName: string) => void;
  toggleSkill: (skillName: string) => void;
  setAllToolsDisabled: (disabled: boolean) => void;
  setAllSkillsDisabled: (disabled: boolean) => void;

  /** Apply overrides to the session. Returns true on success. */
  apply: (sessionId: string) => Promise<boolean>;
  resetToDefault: () => void;

  loadPreset: (presetId: string) => void;
  savePreset: (name: string) => Promise<void>;
  deletePreset: (presetId: string) => Promise<void>;
}

// ── Store ─────────────────────────────────────────────────────

export const useContextEditorStore = create<ContextEditorState>((set, get) => ({
  isOpen: false,
  loadedSessionId: null,
  availableContext: null,
  systemPrompt: null,
  disabledTools: new Set(),
  disabledSkills: new Set(),
  allToolsDisabled: false,
  allSkillsDisabled: false,
  activePresetId: '__default__',
  userPresets: [],
  presetsLoaded: false,
  applyError: null,

  open: async (sessionId) => {
    set({
      isOpen: true,
      loadedSessionId: sessionId,
      availableContext: null,
      systemPrompt: null,
      disabledTools: new Set(),
      disabledSkills: new Set(),
      allToolsDisabled: false,
      allSkillsDisabled: false,
      activePresetId: '__default__',
      applyError: null,
    });

    // Load presets from disk if not yet loaded
    if (!get().presetsLoaded) {
      try {
        const presets = await window.sero.contextPresets.load();
        set({ userPresets: presets, presetsLoaded: true });
      } catch (err) {
        console.error('[context-editor] Failed to load presets:', err);
        set({ presetsLoaded: true });
      }
    }

    try {
      const context = await window.sero.agent.getContext(sessionId);
      if (context) {
        const disabledTools = normalizeDisabledNames(
          context.overrides?.disabledTools,
          context.tools.map((tool) => tool.name),
        );
        const disabledSkills = normalizeDisabledNames(
          context.overrides?.disabledSkills,
          context.skills.map((skill) => skill.name),
        );
        const allToolsDisabled = context.tools.length > 0 && disabledTools.size >= context.tools.length;
        const allSkillsDisabled = context.skills.length > 0 && disabledSkills.size >= context.skills.length;

        set({
          availableContext: context,
          systemPrompt: getAppliedSystemPrompt(context.overrides),
          disabledTools: allToolsDisabled ? new Set() : disabledTools,
          disabledSkills: allSkillsDisabled ? new Set() : disabledSkills,
          allToolsDisabled,
          allSkillsDisabled,
          activePresetId: context.overrides ? null : '__default__',
        });
      }
    } catch (err) {
      console.error('[context-editor] Failed to load context:', err);
    }
  },

  close: () => {
    set({ isOpen: false, applyError: null });
  },

  setSystemPrompt: (value) => {
    set({ systemPrompt: value, activePresetId: null, applyError: null });
  },

  toggleTool: (toolName) => {
    const { disabledTools, allToolsDisabled, availableContext } = get();
    let next: Set<string>;
    if (allToolsDisabled) {
      // Transitioning from "all disabled": populate set with every tool,
      // then remove the one being enabled so only it turns on.
      next = new Set(availableContext?.tools.map((t) => t.name) ?? []);
      next.delete(toolName);
    } else {
      next = new Set(disabledTools);
      if (next.has(toolName)) next.delete(toolName);
      else next.add(toolName);
    }
    // Normalize: if every tool is now individually disabled, collapse
    // back to the allToolsDisabled flag so the master switch stays in sync.
    const totalTools = availableContext?.tools.length ?? 0;
    const allNowDisabled = totalTools > 0 && next.size >= totalTools;
    set({
      disabledTools: allNowDisabled ? new Set() : next,
      allToolsDisabled: allNowDisabled,
      activePresetId: null,
      applyError: null,
    });
  },

  toggleSkill: (skillName) => {
    const { disabledSkills, allSkillsDisabled, availableContext } = get();
    let next: Set<string>;
    if (allSkillsDisabled) {
      // Transitioning from "all disabled": populate set with every skill,
      // then remove the one being enabled so only it turns on.
      next = new Set(availableContext?.skills.map((s) => s.name) ?? []);
      next.delete(skillName);
    } else {
      next = new Set(disabledSkills);
      if (next.has(skillName)) next.delete(skillName);
      else next.add(skillName);
    }
    // Normalize: if every skill is now individually disabled, collapse
    // back to the allSkillsDisabled flag so the master switch stays in sync.
    const totalSkills = availableContext?.skills.length ?? 0;
    const allNowDisabled = totalSkills > 0 && next.size >= totalSkills;
    set({
      disabledSkills: allNowDisabled ? new Set() : next,
      allSkillsDisabled: allNowDisabled,
      activePresetId: null,
      applyError: null,
    });
  },

  setAllToolsDisabled: (disabled) => {
    set({ allToolsDisabled: disabled, disabledTools: new Set(), activePresetId: null, applyError: null });
  },

  setAllSkillsDisabled: (disabled) => {
    set({ allSkillsDisabled: disabled, disabledSkills: new Set(), activePresetId: null, applyError: null });
  },

  apply: async (sessionId) => {
    const { systemPrompt, disabledTools, allToolsDisabled, disabledSkills, allSkillsDisabled, availableContext } = get();

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
      systemPrompt !== null || toolsToDisable.length > 0 || skillsToDisable.length > 0;

    const overrides: ContextOverrides | null = hasOverrides
      ? {
          systemPrompt: systemPrompt ?? undefined,
          disabledTools: toolsToDisable.length > 0 ? toolsToDisable : undefined,
          disabledSkills: skillsToDisable.length > 0 ? skillsToDisable : undefined,
        }
      : null;

    try {
      await window.sero.agent.setContextOverrides(sessionId, overrides);
      set({ applyError: null });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[context-editor] Failed to apply overrides:', msg);
      set({ applyError: msg });
      return false;
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
      applyError: null,
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
      applyError: null,
    });
  },

  savePreset: async (name) => {
    const { systemPrompt, disabledTools, disabledSkills, allToolsDisabled, allSkillsDisabled, userPresets } = get();

    const newPreset: ContextPreset = {
      id: `user-${Date.now()}`,
      name,
      systemPrompt,
      disabledTools: allToolsDisabled ? ['__all__'] : Array.from(disabledTools),
      disabledSkills: allSkillsDisabled ? ['__all__'] : Array.from(disabledSkills),
    };

    const updated = [...userPresets, newPreset];
    try {
      await window.sero.contextPresets.save(updated);
      set({ userPresets: updated, activePresetId: newPreset.id });
    } catch (err) {
      console.error('[context-editor] Failed to save presets:', err);
    }
  },

  deletePreset: async (presetId) => {
    const { userPresets, activePresetId } = get();
    const updated = userPresets.filter((p) => p.id !== presetId);
    try {
      await window.sero.contextPresets.save(updated);
      set({
        userPresets: updated,
        activePresetId: activePresetId === presetId ? null : activePresetId,
      });
    } catch (err) {
      console.error('[context-editor] Failed to save presets:', err);
    }
  },
}));

// ── Grouped Selectors (Issue #8) ──────────────────────────────

/** All available presets (built-in + user). */
export function useAllPresets(): ContextPreset[] {
  const userPresets = useContextEditorStore((s) => s.userPresets);
  return [...BUILTIN_PRESETS, ...userPresets];
}

/** Whether the current state has any overrides from the default. */
export function useHasOverrides(): boolean {
  return useContextEditorStore(
    useShallow((s) =>
      s.systemPrompt !== null ||
      s.disabledTools.size > 0 ||
      s.disabledSkills.size > 0 ||
      s.allToolsDisabled ||
      s.allSkillsDisabled,
    ),
  );
}

/** Grouped editor state to reduce individual subscriptions. */
export function useEditorState() {
  return useContextEditorStore(
    useShallow((s) => ({
      isOpen: s.isOpen,
      availableContext: s.availableContext,
      systemPrompt: s.systemPrompt,
      disabledTools: s.disabledTools,
      disabledSkills: s.disabledSkills,
      allToolsDisabled: s.allToolsDisabled,
      allSkillsDisabled: s.allSkillsDisabled,
      activePresetId: s.activePresetId,
      applyError: s.applyError,
    })),
  );
}

/** Grouped editor actions (stable references, no re-render). */
export function useEditorActions() {
  return useContextEditorStore(
    useShallow((s) => ({
      close: s.close,
      setSystemPrompt: s.setSystemPrompt,
      toggleTool: s.toggleTool,
      toggleSkill: s.toggleSkill,
      setAllToolsDisabled: s.setAllToolsDisabled,
      setAllSkillsDisabled: s.setAllSkillsDisabled,
      apply: s.apply,
      resetToDefault: s.resetToDefault,
      loadPreset: s.loadPreset,
      savePreset: s.savePreset,
      deletePreset: s.deletePreset,
    })),
  );
}
