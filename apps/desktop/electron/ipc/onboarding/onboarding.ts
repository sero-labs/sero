import { ipcMain } from 'electron';
import { IpcChannels } from '../../../src/types/ipc';
import type {
  ModelTierSettings,
  OnboardingState,
  ProviderModelDefaults,
  ResolvedProviderDefaultsState,
} from '../../../src/types/ipc';
import { getOnboardingState, saveOnboardingTierSelections } from '../../features/onboarding';
import {
  resolveProviderDefaultsState,
  writeGlobalProviderModelDefaults,
} from '../../shared/settings/provider-model-defaults';
import { readSettings } from '../../shared/settings/settings-helpers';

export function registerOnboardingHandlers(): void {
  ipcMain.handle(
    IpcChannels.onboarding.getState,
    async (): Promise<OnboardingState> => getOnboardingState(),
  );

  ipcMain.handle(
    IpcChannels.onboarding.saveTierSelections,
    async (_event, tiers: ModelTierSettings): Promise<void> => saveOnboardingTierSelections(tiers),
  );

  ipcMain.handle(
    IpcChannels.providerDefaults.get,
    async (): Promise<ResolvedProviderDefaultsState> => resolveProviderDefaultsState(readSettings()),
  );

  ipcMain.handle(
    IpcChannels.providerDefaults.setGlobalDefaults,
    async (_event, defaults: ProviderModelDefaults): Promise<void> => {
      writeGlobalProviderModelDefaults(defaults);
    },
  );
}
