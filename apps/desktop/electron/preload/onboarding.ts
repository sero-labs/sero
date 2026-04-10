import { ipcRenderer } from 'electron';
import { IpcChannels } from '@/types/ipc';
import type {
  GlobalModelConfigInput,
  GlobalModelConfigState,
  OnboardingState,
} from '@/types/ipc';

export const onboardingBridge = {
  getState: (): Promise<OnboardingState> =>
    ipcRenderer.invoke(IpcChannels.onboarding.getState),
};

export const modelConfigBridge = {
  get: (): Promise<GlobalModelConfigState> =>
    ipcRenderer.invoke(IpcChannels.modelConfig.get),
  set: (config: GlobalModelConfigInput): Promise<GlobalModelConfigState> =>
    ipcRenderer.invoke(IpcChannels.modelConfig.set, config),
};
