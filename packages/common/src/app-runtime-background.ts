/**
 * Background app runtime contract — shared between the desktop host and
 * runtime-enabled Sero plugins.
 *
 * This contract is intentionally renderer-safe / Node-agnostic so external
 * plugins can type against it without importing desktop-internal modules.
 */

export interface AppRuntimeStateApi {
  read<T = unknown>(filePath: string): Promise<T | null>;
  update<T = unknown>(filePath: string, updater: (current: T | null) => T): Promise<void>;
  watch(filePath: string): void;
  unwatch(filePath: string): void;
}

export interface AppRuntimeHost {
  appState: AppRuntimeStateApi;
}

export interface AppRuntimeContext {
  appId: string;
  workspaceId: string;
  workspacePath: string;
  stateFilePath: string;
  host: AppRuntimeHost;
}

export interface AppRuntime {
  start(): Promise<void> | void;
  handleStateChange(state: unknown): Promise<void> | void;
  dispose(): Promise<void> | void;
}

export interface AppRuntimeModule {
  createAppRuntime(ctx: AppRuntimeContext): Promise<AppRuntime> | AppRuntime;
}
