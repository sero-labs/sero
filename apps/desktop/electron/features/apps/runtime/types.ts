import type {
  AppRuntime,
  AppRuntimeContext,
  AppRuntimeHost,
  AppRuntimeModule,
} from '@sero-ai/common';
import type { SeroAppManifest } from '@/types/ipc';

export type {
  AppRuntime,
  AppRuntimeContext,
  AppRuntimeHost,
  AppRuntimeModule,
} from '@sero-ai/common';

export interface AppRuntimeWorkspace {
  id: string;
  path: string;
}

export interface AppRuntimeTarget {
  manifest: SeroAppManifest;
  workspace: AppRuntimeWorkspace;
  stateFilePath: string;
}

export interface AppRuntimeInstance {
  key: string;
  manifest: SeroAppManifest;
  workspaceId: string;
  workspacePath: string;
  stateFilePath: string;
  host: AppRuntimeHost;
  runtime: AppRuntime;
}

export interface AppRuntimeManagerDeps {
  discoverApps: () => Promise<SeroAppManifest[]>;
  getOpenWorkspaces: () => Promise<AppRuntimeWorkspace[]>;
  loadRuntimeModule: (runtimeEntryPath: string) => Promise<AppRuntimeModule>;
  createHost: (target: AppRuntimeTarget) => AppRuntimeHost;
}

export interface ReconcileAppRuntimeOptions {
  manifests?: SeroAppManifest[];
  workspaces?: AppRuntimeWorkspace[];
}

export interface AppRuntimeManagerLike {
  initialize(): Promise<void>;
  reconcile(options?: ReconcileAppRuntimeOptions): Promise<void>;
  handleStateChange(filePath: string, state: unknown): Promise<void>;
  dispose(): Promise<void>;
}
