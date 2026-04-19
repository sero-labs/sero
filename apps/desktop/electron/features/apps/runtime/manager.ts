import path from 'path';
import { appStateManager } from '@electron/features/apps/state/manager';
import { discoverApps } from '@electron/features/apps/discovery';
import { workspaceManager } from '@electron/features/workspace/manager';
import { loadAppRuntimeModule } from './loader';
import type {
  AppRuntimeContext,
  AppRuntimeHost,
  AppRuntimeInstance,
  AppRuntimeManagerDeps,
  AppRuntimeTarget,
  ReconcileAppRuntimeOptions,
} from './types';

function runtimeKey(appId: string, workspaceId: string): string {
  return `${appId}:${workspaceId}`;
}

function manifestSupportsRuntime(manifest: AppRuntimeTarget['manifest']): boolean {
  return Boolean(manifest.runtimeEntry) && manifest.hostCompatibility?.supported !== false;
}

function resolveStateFilePath(target: Pick<AppRuntimeTarget, 'manifest'> & { workspacePath: string }): string | null {
  if (target.manifest.scope === 'global') {
    return target.manifest.globalStatePath;
  }
  return path.join(target.workspacePath, target.manifest.stateFile);
}

function requiresRestart(current: AppRuntimeInstance, target: AppRuntimeTarget): boolean {
  return current.manifest.packagePath !== target.manifest.packagePath
    || current.manifest.runtimeEntry !== target.manifest.runtimeEntry
    || current.stateFilePath !== target.stateFilePath;
}

function createDefaultHost(target: AppRuntimeTarget): AppRuntimeHost {
  return {
    appState: {
      read: async <T = unknown>(filePath: string) => appStateManager.read(filePath) as T | null,
      update: <T = unknown>(filePath: string, updater: (current: T | null) => T) => appStateManager.update(filePath, updater),
      watch: (filePath) => appStateManager.watch(filePath),
      unwatch: (filePath) => appStateManager.unwatch(filePath),
    },
  };
}

function createDefaultDeps(): AppRuntimeManagerDeps {
  return {
    discoverApps,
    getOpenWorkspaces: () => workspaceManager.getOpenWorkspaces(),
    loadRuntimeModule: loadAppRuntimeModule,
    createHost: createDefaultHost,
  };
}

export class AppRuntimeManager {
  private readonly deps: AppRuntimeManagerDeps;
  private readonly instances = new Map<string, AppRuntimeInstance>();
  private initialized = false;

  constructor(deps: AppRuntimeManagerDeps = createDefaultDeps()) {
    this.deps = deps;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    await this.reconcile();
  }

  async reconcile(options: ReconcileAppRuntimeOptions = {}): Promise<void> {
    const manifests = options.manifests ?? await this.deps.discoverApps();
    const workspaces = options.workspaces ?? await this.deps.getOpenWorkspaces();
    const desiredTargets = this.buildTargets(manifests, workspaces);
    const desiredByKey = new Map(desiredTargets.map((target) => [
      runtimeKey(target.manifest.id, target.workspace.id),
      target,
    ]));

    for (const instance of [...this.instances.values()]) {
      const desired = desiredByKey.get(instance.key);
      if (!desired || requiresRestart(instance, desired)) {
        await this.disposeInstance(instance.key);
      }
    }

    for (const target of desiredTargets) {
      const key = runtimeKey(target.manifest.id, target.workspace.id);
      if (this.instances.has(key)) continue;
      await this.startInstance(key, target);
    }
  }

  async handleStateChange(filePath: string, state: unknown): Promise<void> {
    const matchingInstances = [...this.instances.values()]
      .filter((instance) => instance.stateFilePath === filePath);

    for (const instance of matchingInstances) {
      await instance.runtime.handleStateChange(state);
    }
  }

  async dispose(): Promise<void> {
    for (const key of [...this.instances.keys()]) {
      await this.disposeInstance(key);
    }
    this.initialized = false;
  }

  private buildTargets(
    manifests: Awaited<ReturnType<AppRuntimeManagerDeps['discoverApps']>>,
    workspaces: Awaited<ReturnType<AppRuntimeManagerDeps['getOpenWorkspaces']>>,
  ): AppRuntimeTarget[] {
    const targets: AppRuntimeTarget[] = [];

    for (const manifest of manifests) {
      if (!manifestSupportsRuntime(manifest)) continue;

      for (const workspace of workspaces) {
        if (manifest.scope === 'global' && workspace.id !== 'global') {
          continue;
        }
        if (manifest.scope === 'workspace' && workspace.id === 'global') {
          continue;
        }

        const stateFilePath = resolveStateFilePath({ manifest, workspacePath: workspace.path });
        if (!stateFilePath) continue;
        targets.push({ manifest, workspace, stateFilePath });
      }
    }

    return targets;
  }

  private async startInstance(key: string, target: AppRuntimeTarget): Promise<void> {
    if (!target.manifest.runtimeEntry) return;

    const host = this.deps.createHost(target);
    host.appState.watch(target.stateFilePath);

    try {
      const runtimeModule = await this.deps.loadRuntimeModule(target.manifest.runtimeEntry);
      const ctx: AppRuntimeContext = {
        appId: target.manifest.id,
        workspaceId: target.workspace.id,
        workspacePath: target.workspace.path,
        stateFilePath: target.stateFilePath,
        host,
      };
      const runtime = await runtimeModule.createAppRuntime(ctx);
      await runtime.start();

      this.instances.set(key, {
        key,
        manifest: target.manifest,
        workspaceId: target.workspace.id,
        workspacePath: target.workspace.path,
        stateFilePath: target.stateFilePath,
        host,
        runtime,
      });
    } catch (error) {
      host.appState.unwatch(target.stateFilePath);
      throw error;
    }
  }

  private async disposeInstance(key: string): Promise<void> {
    const instance = this.instances.get(key);
    if (!instance) return;

    this.instances.delete(key);
    try {
      await instance.runtime.dispose();
    } finally {
      instance.host.appState.unwatch(instance.stateFilePath);
    }
  }
}

export const appRuntimeManager = new AppRuntimeManager();
