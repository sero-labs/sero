import { create } from 'zustand';
import { openSeroApp } from '@sero-ai/app-runtime';
import type { ModelTierSettings } from '@/types/ipc';
import { useProfileStore } from './profiles';

interface SampleRepairState {
  profileId: string | null;
  eligible: boolean;
  tiers: ModelTierSettings;
  busy: boolean;
  error: string | null;
  projectId: string | null;
  load: () => Promise<void>;
  launch: () => Promise<void>;
}

export const useSampleRepairStore = create<SampleRepairState>((set, get) => ({
  profileId: null, eligible: false, tiers: {}, busy: false, error: null, projectId: null,
  load: async () => {
    const profileId = useProfileStore.getState().activeProfile?.id;
    if (get().profileId !== (profileId ?? null)) set({ profileId: profileId ?? null, eligible: false, tiers: {}, busy: false, error: null, projectId: null });
    if (!profileId) return;
    try {
      const [onboarding, config] = await Promise.all([window.sero.onboarding.getState(), window.sero.modelConfig.get()]);
      if (useProfileStore.getState().activeProfile?.id !== profileId) return;
      set({ eligible: !onboarding.needed && onboarding.hasAnyUsableModels, tiers: config.tiers });
    } catch {
      if (useProfileStore.getState().activeProfile?.id === profileId) set({ eligible: false });
    }
  },
  launch: async () => {
    if (get().busy || !get().eligible) return;
    const profileId = useProfileStore.getState().activeProfile?.id;
    const selectedTiers = JSON.stringify(get().tiers);
    set({ busy: true, error: null });
    const stillHere = () => useProfileStore.getState().activeProfile?.id === profileId;
    try {
      const config = await window.sero.modelConfig.get();
      if (!stillHere()) return;
      if (JSON.stringify(config.tiers) !== selectedTiers) {
        set({ tiers: config.tiers });
        throw new Error('Your selected models changed. Review them below before starting.');
      }
      const result = await window.sero.appAgent.invokeTool('architect', 'global', 'architect_projects', { action: 'sample_repair' });
      if (!stillHere()) return;
      if (result.isError || result.details?.ok === false) throw new Error(result.text.replace(/^Error:\s*/, ''));
      const projectId = result.details?.projectId;
      if (typeof projectId !== 'string') throw new Error('The sample did not return a project. Retry to recover the saved workspace.');
      set({ projectId });
      const opened = await openSeroApp('architect', { projectId });
      if (!opened) throw new Error('The sample is saved. Return here to open it again.');
      if (result.details?.needsStart === true && stillHere()) {
        // Navigation removes the starter before the existing host approval appears.
        const started = await window.sero.appAgent.invokeTool('architect', 'global', 'architect_projects', { action: 'resume', projectId });
        if (stillHere() && (started.isError || started.details?.ok === false)) throw new Error(started.text);
      }
    } catch (error) {
      if (stillHere()) set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (stillHere()) set({ busy: false });
    }
  },
}));
