import type { ContainerManager } from '@electron/features/container';
import { containerManager } from '@electron/features/container/core/singleton';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import { workspaceManager } from '@electron/features/workspace/manager';
import { AppleContainerBackend } from './backends/apple-container-backend';
import { MacHostBackend } from './backends/mac-host-backend';
import type { RuntimeBackend, RuntimeBackendId, RuntimeHealth } from './types';

export interface RuntimeManagerDependencies {
  workspaceManager: WorkspaceManager;
  containerManager: ContainerManager;
  resolveBackend?: (workspaceId: string) => Promise<RuntimeBackendId> | RuntimeBackendId;
}

export class RuntimeManager {
  private readonly backends = new Map<string, RuntimeBackend>();

  constructor(private readonly dependencies: RuntimeManagerDependencies) {}

  async getRuntime(workspaceId: string): Promise<RuntimeBackend> {
    const backendId = await this.resolveBackendId(workspaceId);
    const cacheKey = `${workspaceId}:${backendId}`;
    const cached = this.backends.get(cacheKey);
    if (cached) return cached;

    const hostWorkspacePath = this.dependencies.workspaceManager.getPath(workspaceId);
    if (!hostWorkspacePath) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const backend = this.createBackend(backendId, workspaceId, hostWorkspacePath);
    this.backends.set(cacheKey, backend);
    return backend;
  }

  async getHealth(workspaceId: string): Promise<RuntimeHealth> {
    const runtime = await this.getRuntime(workspaceId);
    return runtime.health();
  }

  async destroy(workspaceId: string): Promise<void> {
    const runtimes = [...this.backends.entries()].filter(([key]) => key.startsWith(`${workspaceId}:`));
    await Promise.all(runtimes.map(([, runtime]) => runtime.destroy()));
    for (const [key] of runtimes) {
      this.backends.delete(key);
    }
  }

  async destroyAll(): Promise<void> {
    await Promise.all([...this.backends.values()].map((runtime) => runtime.destroy()));
    this.backends.clear();
  }

  private createBackend(
    backendId: RuntimeBackendId,
    workspaceId: string,
    hostWorkspacePath: string,
  ): RuntimeBackend {
    switch (backendId) {
      case 'mac-host':
        return new MacHostBackend({ workspaceId, hostWorkspacePath });
      case 'apple-container':
        return new AppleContainerBackend({
          workspaceId,
          hostWorkspacePath,
          workspaceManager: this.dependencies.workspaceManager,
          containerManager: this.dependencies.containerManager,
        });
      case 'docker':
        throw new Error('Docker runtime backend is not implemented yet.');
    }
  }

  private async resolveBackendId(workspaceId: string): Promise<RuntimeBackendId> {
    if (this.dependencies.resolveBackend) {
      return this.dependencies.resolveBackend(workspaceId);
    }

    return (await this.dependencies.workspaceManager.getRuntimeConfig(workspaceId)).backend;
  }
}

export const runtimeManager = new RuntimeManager({
  workspaceManager,
  containerManager,
});
