import { ipcRenderer } from 'electron';

import { IpcChannels } from '@/types/ipc-channels';
import type {
  SeroAppManifest,
  AuthProvidersResponse,
  OAuthEvent,
  ContainerInfo,
  DevServer,
  DevServerEvent,
  VoiceTranscriptionStatus,
  VoiceTranscriptionResult,
  AppControlEntry,
  AppInteractionParams,
  AppInteractionResult,
  AppPanelRect,
  AppRecordingResult,
  AppRecordingStatus,
  CreateGitHubRepoInput,
  CreateGitHubRepoResult,
} from '@/types/ipc';
import type {
  AppToolResult,
  WebAppActionResult,
  WebAppRequest,
} from '@sero-ai/common';
import type { GitHubDeviceFlowEvent } from '@/types/electron-services';

export const appStateBridge = {
  read: (filePath: string): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.appState.read, filePath),

  readText: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.appState.readText, filePath),

  write: (filePath: string, data: unknown): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.appState.write, filePath, data),

  remove: (filePath: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.appState.remove, filePath),

  watch: (filePath: string): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannels.appState.watch, filePath),

  unwatch: (filePath: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.appState.unwatch, filePath),

  onChange: (callback: (filePath: string, data: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, fp: string, data: unknown) => {
      callback(fp, data);
    };
    ipcRenderer.on(IpcChannels.appState.change, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.appState.change, handler);
    };
  },
};

export const appsBridge = {
  discover: (): Promise<SeroAppManifest[]> =>
    ipcRenderer.invoke(IpcChannels.apps.discover),
  onNewAppDetected: (callback: (appName: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, name: string) => {
      callback(name);
    };
    ipcRenderer.on(IpcChannels.apps.newAppDetected, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.apps.newAppDetected, handler);
    };
  },
};

export const appAgentBridge = {
  prompt: (appId: string, workspaceId: string, text: string): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.appAgent.prompt, appId, workspaceId, text),

  promptStream: (
    appId: string,
    workspaceId: string,
    text: string,
    onDelta: (delta: string) => void,
  ): Promise<string> => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { appId: string; workspaceId: string; delta: string },
    ) => {
      if (data.appId === appId && data.workspaceId === workspaceId) {
        onDelta(data.delta);
      }
    };
    ipcRenderer.on(IpcChannels.appAgent.streamEvent, handler);
    return ipcRenderer
      .invoke(IpcChannels.appAgent.promptStream, appId, workspaceId, text)
      .finally(() => {
        ipcRenderer.removeListener(IpcChannels.appAgent.streamEvent, handler);
      });
  },

  invokeTool: (
    appId: string,
    workspaceId: string,
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<AppToolResult> =>
    ipcRenderer.invoke(IpcChannels.appAgent.invokeTool, appId, workspaceId, toolName, params),
};

export const webAppBridge = {
  run: (workspaceId: string, params: WebAppRequest): Promise<WebAppActionResult> =>
    ipcRenderer.invoke(IpcChannels.webApp.run, workspaceId, params),
};

export const appControlBridge = {
  list: (): Promise<AppControlEntry[]> =>
    ipcRenderer.invoke(IpcChannels.appControl.list),
  active: (): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.appControl.active),
  open: (appId: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.appControl.open, appId),
  info: (appId: string): Promise<AppControlEntry | null> =>
    ipcRenderer.invoke(IpcChannels.appControl.info, appId),
  openFile: (workspaceId: string, filePath: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.appControl.openFile, workspaceId, filePath),
  screenshot: (): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.appControl.screenshot),
  interact: (params: AppInteractionParams): Promise<AppInteractionResult> =>
    ipcRenderer.invoke(IpcChannels.appControl.interact, params),
  getAppRect: (): Promise<AppPanelRect | null> =>
    ipcRenderer.invoke(IpcChannels.appControl.getAppRect),
  recordStart: (): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.appControl.recordStart),
  recordStop: (): Promise<AppRecordingResult | null> =>
    ipcRenderer.invoke(IpcChannels.appControl.recordStop),
  recordStatus: (): Promise<AppRecordingStatus> =>
    ipcRenderer.invoke(IpcChannels.appControl.recordStatus),
};

export const voiceBridge = {
  status: (): Promise<VoiceTranscriptionStatus> =>
    ipcRenderer.invoke(IpcChannels.voice.status),
  transcribe: (audioDataUrl: string, mimeType?: string): Promise<VoiceTranscriptionResult> =>
    ipcRenderer.invoke(IpcChannels.voice.transcribe, audioDataUrl, mimeType),
};

export const authBridge = {
  getProviders: (): Promise<AuthProvidersResponse> =>
    ipcRenderer.invoke(IpcChannels.auth.getProviders),
  login: (providerId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.auth.login, providerId),
  logout: (providerId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.auth.logout, providerId),
  setApiKey: (providerId: string, key: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.auth.setApiKey, providerId, key),
  removeApiKey: (providerId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.auth.removeApiKey, providerId),
  respondPrompt: (value: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.auth.respondPrompt, value),
  respondSelect: (value: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.auth.respondSelect, value),
  respondManualCode: (value: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.auth.respondManualCode, value),
  cancel: (): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.auth.cancel),
  onEvent: (callback: (event: OAuthEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: OAuthEvent) => {
      callback(data);
    };
    ipcRenderer.on(IpcChannels.auth.event, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.auth.event, handler);
    };
  },
};

export const containerBridge = {
  status: (workspaceId: string): Promise<ContainerInfo | null> =>
    ipcRenderer.invoke(IpcChannels.container.status, workspaceId),
  inspect: (workspaceId: string): Promise<ContainerInfo> =>
    ipcRenderer.invoke(IpcChannels.container.inspect, workspaceId),
  ensure: (workspaceId: string): Promise<ContainerInfo | null> =>
    ipcRenderer.invoke(IpcChannels.container.ensure, workspaceId),
};

export const devServerBridge = {
  list: (workspaceId?: string): Promise<DevServer[]> =>
    ipcRenderer.invoke(IpcChannels.devServer.list, workspaceId),
  stop: (serverId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.devServer.stop, serverId),
  restart: (serverId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.devServer.restart, serverId),
  unregister: (serverId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.devServer.unregister, serverId),
  openInBrowser: (serverId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.devServer.openInBrowser, serverId),
  onEvent: (callback: (event: DevServerEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: DevServerEvent) => {
      callback(data);
    };
    ipcRenderer.on(IpcChannels.devServer.event, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.devServer.event, handler);
    };
  },
};

export const githubBridge = {
  status: (): Promise<{ authenticated: boolean; username?: string; scopes?: string }> =>
    ipcRenderer.invoke(IpcChannels.github.status),
  login: (): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.github.login),
  logout: (): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.github.logout),
  cancel: (): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.github.cancel),
  onEvent: (callback: (event: GitHubDeviceFlowEvent) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: GitHubDeviceFlowEvent) => callback(data);
    ipcRenderer.on(IpcChannels.github.event, handler);
    return () => ipcRenderer.removeListener(IpcChannels.github.event, handler);
  },
  createRepo: (workspaceId: string, input: CreateGitHubRepoInput): Promise<CreateGitHubRepoResult> =>
    ipcRenderer.invoke(IpcChannels.github.createRepo, workspaceId, input),
};
