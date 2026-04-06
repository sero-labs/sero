import { ipcMain } from 'electron';
import { IpcChannels } from '../../../src/types/ipc';
import type { OnboardingState } from '../../../src/types/ipc';
import { getOnboardingState } from '../../features/onboarding';

export function registerOnboardingHandlers(): void {
  ipcMain.handle(
    IpcChannels.onboarding.getState,
    async (): Promise<OnboardingState> => getOnboardingState(),
  );
}
