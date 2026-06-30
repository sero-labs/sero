/**
 * Context-editor store — session-side IPC adapter for the shared
 * @sero-ai/ui ContextEditor. Holds only what crosses IPC: which session is
 * loaded, its available context, saved presets, and the last apply error.
 * All editing state (system prompt, tool/skill toggles, preset selection)
 * lives inside the shared ContextEditor component.
 */

import { create } from 'zustand';
import type { SessionContext, ContextOverrides, ContextPreset } from '@/types/ipc';

type ContextPresetBody = Pick<ContextPreset, 'systemPrompt' | 'disabledTools' | 'disabledSkills'>;

interface ContextEditorState {
  isOpen: boolean;
  loadedSessionId: string | null;
  availableContext: SessionContext | null;
  userPresets: ContextPreset[];
  presetsLoaded: boolean;
  applyError: string | null;

  open: (sessionId: string) => Promise<void>;
  close: () => void;
  /** Apply overrides to the live session. Returns true on success. */
  apply: (sessionId: string, overrides: ContextOverrides | null) => Promise<boolean>;
  savePreset: (name: string, preset: ContextPresetBody) => Promise<void>;
  deletePreset: (presetId: string) => Promise<void>;
}

export const useContextEditorStore = create<ContextEditorState>((set, get) => ({
  isOpen: false,
  loadedSessionId: null,
  availableContext: null,
  userPresets: [],
  presetsLoaded: false,
  applyError: null,

  open: async (sessionId) => {
    set({ isOpen: true, loadedSessionId: sessionId, availableContext: null, applyError: null });

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
      if (context) set({ availableContext: context });
    } catch (err) {
      console.error('[context-editor] Failed to load context:', err);
    }
  },

  close: () => {
    set({ isOpen: false, applyError: null });
  },

  apply: async (sessionId, overrides) => {
    try {
      await window.sero.agent.setContextOverrides(sessionId, overrides);
      set({
        applyError: null,
        availableContext: get().availableContext
          ? { ...get().availableContext!, overrides }
          : null,
      });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[context-editor] Failed to apply overrides:', msg);
      set({ applyError: msg });
      return false;
    }
  },

  savePreset: async (name, preset) => {
    const newPreset: ContextPreset = { id: `user-${Date.now()}`, name, ...preset };
    const updated = [...get().userPresets, newPreset];
    try {
      await window.sero.contextPresets.save(updated);
      set({ userPresets: updated });
    } catch (err) {
      console.error('[context-editor] Failed to save presets:', err);
    }
  },

  deletePreset: async (presetId) => {
    const updated = get().userPresets.filter((p) => p.id !== presetId);
    try {
      await window.sero.contextPresets.save(updated);
      set({ userPresets: updated });
    } catch (err) {
      console.error('[context-editor] Failed to save presets:', err);
    }
  },
}));

/** Whether the loaded session has persisted context overrides applied. */
export function useHasOverrides(): boolean {
  return useContextEditorStore((s) => s.availableContext?.overrides != null);
}
