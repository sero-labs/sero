import { ipcRenderer } from 'electron';
import { IpcChannels } from '../../src/types/ipc';
import type {
  ModelTierSettings,
  OnboardingState,
  ProviderModelDefaults,
  ResolvedProviderDefaultsState,
} from '../../src/types/ipc';

export const onboardingBridge = {
  getState: (): Promise<OnboardingState> =>
    ipcRenderer.invoke(IpcChannels.onboarding.getState),
  saveTierSelections: (tiers: ModelTierSettings): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.onboarding.saveTierSelections, tiers),
};

export const providerDefaultsBridge = {
  get: (): Promise<ResolvedProviderDefaultsState> =>
    ipcRenderer.invoke(IpcChannels.providerDefaults.get),
  setGlobalDefaults: (defaults: ProviderModelDefaults): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.providerDefaults.setGlobalDefaults, defaults),
};
