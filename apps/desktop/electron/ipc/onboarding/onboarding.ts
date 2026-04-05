import { ipcMain } from 'electron';
import { readFileSync } from 'fs';
import path from 'path';
import { IpcChannels } from '../../../src/types/ipc';
import type {
  ModelTierSettings,
  OnboardingState,
  ProviderModelDefaults,
  ResolvedProviderDefaultsState,
} from '../../../src/types/ipc';
import { SERO_AGENT_DIR } from '../../platform/env';
import { getOnboardingState, saveOnboardingTierSelections } from '../../features/onboarding';
import {
  resolveProviderDefaultsState,
  writeGlobalProviderModelDefaults,
} from '../../shared/settings/provider-model-defaults';

function readSettings(): Record<string, unknown> {
  const settingsPath = path.join(SERO_AGENT_DIR, 'settings.json');
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

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
