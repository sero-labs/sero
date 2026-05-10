import type { ContainerManager } from '@electron/features/container';
import { containerManager } from '@electron/features/container/core/singleton';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import { workspaceManager } from '@electron/features/workspace/manager';
import { getRuntimeCapabilities } from './capabilities';
import { RUNTIME_WORKSPACE_PATH } from './runtime-paths';
import type {
  RuntimeBackend,
  RuntimeBackendId,
  RuntimeCapabilities,
  RuntimeCreateDirectoryInput,
  RuntimeCreateFileInput,
  RuntimeDeleteInput,
  RuntimeDevServer,
  RuntimeDevServerRestartInput,
  RuntimeDevServerStartInput,
  RuntimeDevServerStatus,
  RuntimeDevServerStatusInput,
  RuntimeDevServerStopInput,
  RuntimeDirectoryEntry,
  RuntimeExecInput,
  RuntimeExecResult,
  RuntimeFileReadResult,
  RuntimeFileWatch,
  RuntimeFileWatchInput,
  RuntimeForwardedPort,
  RuntimeForwardPortInput,
  RuntimeHealth,
  RuntimeListFilesInput,
  RuntimePreviewUrl,
  RuntimePreviewUrlInput,
  RuntimeProcess,
  RuntimeProcessInput,
  RuntimeReadFileInput,
  RuntimeRenameInput,
  RuntimeSession,
  RuntimeStopForwardInput,
  RuntimeTerminalInput,
  RuntimeTerminalSession,
  RuntimeWorkspaceAccess,
  RuntimeWriteFileInput,
} from './types';

export interface RuntimeManagerDependencies {
  workspaceManager: Pick<WorkspaceManager, 'getPath' | 'isContainerEnabled'>;
  containerManager: ContainerManager;
  resolveBackend?: (workspaceId: string) => Promise<RuntimeBackendId> | RuntimeBackendId;
}

interface PlaceholderBackendOptions {
  backend: RuntimeBackendId;
  workspaceId: string;
  hostWorkspacePath: string;
}

class PlaceholderRuntimeBackend implements RuntimeBackend {
  readonly backend: RuntimeBackendId;
  readonly workspaceId: string;
  readonly hostWorkspacePath: string;
  readonly runtimeWorkspacePath = RUNTIME_WORKSPACE_PATH;
  readonly workspaceAccess: RuntimeWorkspaceAccess;
  readonly capabilities: RuntimeCapabilities;

  constructor(options: PlaceholderBackendOptions) {
    this.backend = options.backend;
    this.workspaceId = options.workspaceId;
    this.hostWorkspacePath = options.hostWorkspacePath;
    this.workspaceAccess = options.backend === 'mac-host' ? 'host' : 'live-mount';
    this.capabilities = getRuntimeCapabilities(options.backend);
  }

  async health(): Promise<RuntimeHealth> {
    return {
      backend: this.backend,
      status: 'unsupported',
      message: `${this.backend} runtime adapter is not implemented yet.`,
    };
  }

  async ensure(): Promise<RuntimeSession> { throw this.notImplemented('ensure'); }
  async destroy(): Promise<void> { return; }
  async exec(_input: RuntimeExecInput): Promise<RuntimeExecResult> { throw this.notImplemented('exec'); }
  async spawn(_input: RuntimeProcessInput): Promise<RuntimeProcess> { throw this.notImplemented('spawn'); }
  async readFile(_input: RuntimeReadFileInput): Promise<RuntimeFileReadResult> { throw this.notImplemented('readFile'); }
  async writeFile(_input: RuntimeWriteFileInput): Promise<void> { throw this.notImplemented('writeFile'); }
  async listFiles(_input: RuntimeListFilesInput): Promise<RuntimeDirectoryEntry[]> { throw this.notImplemented('listFiles'); }
  async rename(_input: RuntimeRenameInput): Promise<void> { throw this.notImplemented('rename'); }
  async delete(_input: RuntimeDeleteInput): Promise<void> { throw this.notImplemented('delete'); }
  async createFile(_input: RuntimeCreateFileInput): Promise<void> { throw this.notImplemented('createFile'); }
  async createDirectory(_input: RuntimeCreateDirectoryInput): Promise<void> { throw this.notImplemented('createDirectory'); }
  async watchFiles(_input: RuntimeFileWatchInput): Promise<RuntimeFileWatch> { throw this.notImplemented('watchFiles'); }
  async createTerminal(_input: RuntimeTerminalInput): Promise<RuntimeTerminalSession> { throw this.notImplemented('createTerminal'); }
  async startDevServer(_input: RuntimeDevServerStartInput): Promise<RuntimeDevServer> { throw this.notImplemented('startDevServer'); }
  async stopDevServer(_input: RuntimeDevServerStopInput): Promise<void> { throw this.notImplemented('stopDevServer'); }
  async restartDevServer(_input: RuntimeDevServerRestartInput): Promise<RuntimeDevServer> { throw this.notImplemented('restartDevServer'); }
  async getDevServerStatus(_input: RuntimeDevServerStatusInput): Promise<RuntimeDevServerStatus> { throw this.notImplemented('getDevServerStatus'); }
  async forwardPort(_input: RuntimeForwardPortInput): Promise<RuntimeForwardedPort> { throw this.notImplemented('forwardPort'); }
  async stopForward(_input: RuntimeStopForwardInput): Promise<void> { throw this.notImplemented('stopForward'); }
  async resolvePreviewUrl(_input: RuntimePreviewUrlInput): Promise<RuntimePreviewUrl> { throw this.notImplemented('resolvePreviewUrl'); }

  private notImplemented(method: string): Error {
    return new Error(`${this.backend} runtime ${method} is not implemented yet`);
  }
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

    const backend = new PlaceholderRuntimeBackend({
      backend: backendId,
      workspaceId,
      hostWorkspacePath,
    });
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

  private async resolveBackendId(workspaceId: string): Promise<RuntimeBackendId> {
    if (this.dependencies.resolveBackend) {
      return this.dependencies.resolveBackend(workspaceId);
    }

    const containerEnabled = await this.dependencies.workspaceManager.isContainerEnabled(workspaceId);
    return containerEnabled ? 'apple-container' : 'mac-host';
  }
}

export const runtimeManager = new RuntimeManager({
  workspaceManager,
  containerManager,
});
