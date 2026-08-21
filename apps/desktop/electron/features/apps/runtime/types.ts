import type {
  AppRuntime,
  AppRuntimeContext,
  AppRuntimeHost,
  AppRuntimeModule,
  AppRuntimeSkillsApi,
  PersistentSessionsApi,
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

export interface LoadAppRuntimeModuleOptions {
  externals?: string[];
}

export interface AppRuntimeManagerDeps {
  discoverApps: () => Promise<SeroAppManifest[]>;
  getOpenWorkspaces: () => Promise<AppRuntimeWorkspace[]>;
  loadRuntimeModule: (
    runtimeEntryPath: string,
    options?: LoadAppRuntimeModuleOptions,
  ) => Promise<AppRuntimeModule>;
  createHost: (target: AppRuntimeTarget) => AppRuntimeHost;
  /**
   * Installs the gated persistent-session capability, or returns null when the
   * app is not a permitted bundled plugin. Optional so a test can construct a
   * manager without it.
   */
  installPersistentSessions?: (target: AppRuntimeTarget) => Promise<PersistentSessionsApi | null>;
  /**
   * Installs the gated user-skill capability, or returns null when the app is
   * not a permitted bundled plugin. Optional for the same reason.
   */
  installSkills?: (target: AppRuntimeTarget) => Promise<AppRuntimeSkillsApi | null>;
}

export interface ReconcileAppRuntimeOptions {
  manifests?: SeroAppManifest[];
  workspaces?: AppRuntimeWorkspace[];
}

export interface AppRuntimeManagerLike {
  initialize(): Promise<void>;
  reconcile(options?: ReconcileAppRuntimeOptions): Promise<void>;
  restartApp(appId: string): Promise<void>;
  handleStateChange(filePath: string, state: unknown): Promise<void>;
  dispose(): Promise<void>;
}
