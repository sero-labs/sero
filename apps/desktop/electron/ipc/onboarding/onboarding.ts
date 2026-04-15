import { ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { OnboardingState } from '@/types/ipc';
import { getOnboardingState } from '@electron/features/onboarding';

export function registerOnboardingHandlers(): void {
  ipcMain.handle(
    IpcChannels.onboarding.getState,
    async (): Promise<OnboardingState> => getOnboardingState(),
  );
}
