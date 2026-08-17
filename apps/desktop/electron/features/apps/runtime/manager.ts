import path from 'path';
import { discoverApps } from '@electron/features/apps/discovery';
import { workspaceManager } from '@electron/features/workspace/manager';
import { loadAppRuntimeModule } from './loader';
import { createAppRuntimeHost } from './capabilities/create-host';
import { installPersistentSessions } from './capabilities/persistent-sessions/wiring';
import type {
  AppRuntimeContext,
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

function createDefaultDeps(): AppRuntimeManagerDeps {
  return {
    discoverApps,
    getOpenWorkspaces: () => workspaceManager.getOpenWorkspaces(),
    loadRuntimeModule: loadAppRuntimeModule,
    createHost: createAppRuntimeHost,
    installPersistentSessions,
  };
}

export class AppRuntimeManager {
  private readonly deps: AppRuntimeManagerDeps;
  private readonly instances = new Map<string, AppRuntimeInstance>();
  private initialized = false;
  private initializationTask: Promise<void> | null = null;
  private reconcileTail: Promise<void> = Promise.resolve();

  constructor(deps: AppRuntimeManagerDeps = createDefaultDeps()) {
    this.deps = deps;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializationTask) {
      return this.initializationTask;
    }

    this.initializationTask = (async () => {
      await this.reconcile();
      this.initialized = true;
    })();

    try {
      await this.initializationTask;
    } finally {
      this.initializationTask = null;
    }
  }

  async reconcile(options: ReconcileAppRuntimeOptions = {}): Promise<void> {
    return this.enqueueOperation(() => this.runReconcile(options));
  }

  async restartApp(appId: string): Promise<void> {
    return this.enqueueOperation(() => this.runRestartApp(appId));
  }

  async handleStateChange(filePath: string, state: unknown): Promise<void> {
    const matchingInstances = [...this.instances.values()]
      .filter((instance) => instance.stateFilePath === filePath);

    await Promise.all(matchingInstances.map((instance) => instance.runtime.handleStateChange(state)));
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.instances.keys()].map((key) => this.disposeInstance(key)));
    this.initialized = false;
  }

  private enqueueOperation(taskFactory: () => Promise<void>): Promise<void> {
    const task = this.reconcileTail
      .catch(() => undefined)
      .then(() => taskFactory());

    this.reconcileTail = task.catch(() => undefined);
    return task;
  }

  private async runReconcile(options: ReconcileAppRuntimeOptions): Promise<void> {
    const [manifests, workspaces] = await Promise.all([
      options.manifests ?? this.deps.discoverApps(),
      options.workspaces ?? this.deps.getOpenWorkspaces(),
    ]);
    const desiredTargets = this.buildTargets(manifests, workspaces);
    const desiredByKey = new Map(desiredTargets.map((target) => [
      runtimeKey(target.manifest.id, target.workspace.id),
      target,
    ]));
    const failedKeys = new Set<string>();

    await Promise.all([...this.instances.values()].map(async (instance) => {
      const desired = desiredByKey.get(instance.key);
      if (!desired || requiresRestart(instance, desired)) {
        try {
          await this.disposeInstance(instance.key);
        } catch (error) {
          failedKeys.add(instance.key);
          console.error(`[app-runtime] Failed to dispose runtime ${instance.key} during reconcile:`, error);
        }
      }
    }));

    await Promise.all(desiredTargets.map(async (target) => {
      const key = runtimeKey(target.manifest.id, target.workspace.id);
      if (failedKeys.has(key) || this.instances.has(key)) return;
      try {
        await this.startInstance(key, target);
      } catch (error) {
        console.error(`[app-runtime] Failed to start runtime ${key} during reconcile:`, error);
      }
    }));
  }

  private async runRestartApp(appId: string): Promise<void> {
    const [manifests, workspaces] = await Promise.all([
      this.deps.discoverApps(),
      this.deps.getOpenWorkspaces(),
    ]);
    const desiredTargets = this.buildTargets(manifests, workspaces)
      .filter((target) => target.manifest.id === appId);
    const desiredKeys = new Set(desiredTargets.map((target) => runtimeKey(target.manifest.id, target.workspace.id)));

    await Promise.all([...this.instances.values()].map(async (instance) => {
      if (instance.manifest.id !== appId) return;
      try {
        await this.disposeInstance(instance.key);
      } catch (error) {
        console.error(`[app-runtime] Failed to dispose runtime ${instance.key} during restart:`, error);
        desiredKeys.delete(instance.key);
      }
    }));

    await Promise.all(desiredTargets.map(async (target) => {
      const key = runtimeKey(target.manifest.id, target.workspace.id);
      if (!desiredKeys.has(key) || this.instances.has(key)) return;
      try {
        await this.startInstance(key, target);
      } catch (error) {
        console.error(`[app-runtime] Failed to start runtime ${key} during restart:`, error);
      }
    }));
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
        if (!stateFilePath) {
          if (manifest.scope === 'global') {
            console.warn(`[app-runtime] Skipping global runtime ${manifest.id}: missing globalStatePath.`);
          }
          continue;
        }
        targets.push({ manifest, workspace, stateFilePath });
      }
    }

    return targets;
  }

  private async startInstance(key: string, target: AppRuntimeTarget): Promise<void> {
    if (!target.manifest.runtimeEntry) return;

    const host = this.deps.createHost(target);
    // Install the gated persistent-session capability BEFORE the runtime is
    // constructed, so a runtime never observes it appearing mid-life. The gate
    // runs against the FINAL discovered manifest, which is what makes
    // discoverApps()'s last-write-wins de-duplication irrelevant to authority.
    const persistentSessions = await this.deps.installPersistentSessions?.(target);
    if (persistentSessions) host.persistentSessions = persistentSessions;

    host.appState.watch(target.stateFilePath);

    try {
      const runtimeModule = await this.deps.loadRuntimeModule(target.manifest.runtimeEntry, {
        externals: target.manifest.runtimeExternals,
      });
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

  /**
   * Dispose every app-runtime bound to a workspace, releasing the file handles
   * and state-file watchers they hold inside it. MUST run before a workspace's
   * files are deleted — otherwise a live runtime keeps its cwd/handles open and
   * the directory can't be fully removed (ENOTEMPTY on node_modules). Per-instance
   * errors are swallowed so one stuck runtime can't block the others.
   */
  async disposeWorkspace(workspaceId: string): Promise<void> {
    const instances = [...this.instances.values()].filter((instance) => instance.workspaceId === workspaceId);
    await Promise.all(instances.map(async (instance) => {
      try {
        await this.disposeInstance(instance.key);
      } catch (error) {
        console.error(`[app-runtime] Failed to dispose runtime ${instance.key} for workspace ${workspaceId}:`, error);
      }
    }));
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
