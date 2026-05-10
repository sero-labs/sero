import type { ContainerManager } from '@electron/features/container';
import { containerManager } from '@electron/features/container/core/singleton';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import { workspaceManager } from '@electron/features/workspace/manager';
import { AppleContainerBackend } from './backends/apple-container-backend';
import { DockerBackend } from './backends/docker/docker-backend';
import { MacHostBackend } from './backends/mac-host-backend';
import type { RuntimeBackend, RuntimeBackendId, RuntimeHealth, RuntimeTerminalSession } from './types';

export interface RuntimeManagerDependencies {
  workspaceManager: WorkspaceManager;
  containerManager: ContainerManager;
  resolveBackend?: (workspaceId: string) => Promise<RuntimeBackendId> | RuntimeBackendId;
}

export class RuntimeManager {
  private readonly backends = new Map<string, RuntimeBackend>();
  private readonly terminals = new Map<string, { workspaceId: string; session: RuntimeTerminalSession }>();
  private readonly terminalExitCallbacks = new Set<(terminalId: string) => void>();

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

  async createTerminal(
    workspaceId: string,
    terminalId: string,
    cols?: number,
    rows?: number,
  ): Promise<{ runtime: RuntimeBackend; session: RuntimeTerminalSession }> {
    const runtime = await this.getRuntime(workspaceId);
    const session = await runtime.createTerminal({
      terminalId,
      cwd: runtime.runtimeWorkspacePath,
      cols,
      rows,
    });
    this.terminals.set(terminalId, { workspaceId, session });
    session.onExit(() => {
      this.terminals.delete(terminalId);
      for (const cb of this.terminalExitCallbacks) cb(terminalId);
    });
    return { runtime, session };
  }

  getTerminal(terminalId: string): RuntimeTerminalSession | undefined {
    return this.terminals.get(terminalId)?.session;
  }

  writeTerminal(terminalId: string, data: string): void {
    this.terminals.get(terminalId)?.session.write(data);
  }

  resizeTerminal(terminalId: string, cols: number, rows: number): void {
    this.terminals.get(terminalId)?.session.resize?.(cols, rows);
  }

  getTerminalReplayBuffer(terminalId: string): string {
    return this.terminals.get(terminalId)?.session.replayBuffer() ?? '';
  }

  readWorkspaceTerminalOutput(workspaceId: string, lines: number): string {
    const buffers = [...this.terminals.values()]
      .filter((entry) => entry.workspaceId === workspaceId)
      .map((entry) => entry.session.replayBuffer())
      .filter(Boolean);
    const joined = buffers.join('\n');
    return joined.split('\n').slice(-lines).join('\n');
  }

  getWorkspaceTerminalIds(workspaceId: string): string[] {
    return [...this.terminals.entries()]
      .filter(([, entry]) => entry.workspaceId === workspaceId)
      .map(([terminalId]) => terminalId);
  }

  hasRuntime(workspaceId: string): boolean {
    return [...this.backends.keys()].some((key) => key.startsWith(`${workspaceId}:`));
  }

  listDevServersSync(workspaceId: string): Array<{
    id: string;
    port: number;
    url: string;
    command: string;
    cwd: string;
  }> {
    const runtimeServers = [...this.backends.entries()]
      .filter(([key]) => key.startsWith(`${workspaceId}:`))
      .flatMap(([, runtime]) => runtime.listDevServersSync?.() ?? []);
    const legacyServers = this.dependencies.containerManager.devServers?.list(workspaceId) ?? [];
    return [...runtimeServers, ...legacyServers].map((server) => ({
      id: server.id,
      port: server.port,
      url: server.url,
      command: server.command,
      cwd: server.cwd,
    }));
  }

  onDevServerChange(cb: (event: {
    type: 'registered' | 'unregistered' | 'status_changed';
    serverId?: string;
    server?: { workspaceId: string };
    status?: 'running' | 'stopped' | 'starting';
  }) => void): () => void {
    return this.dependencies.containerManager.devServers.onChange(cb);
  }

  disposeTerminal(terminalId: string): void {
    const terminal = this.terminals.get(terminalId)?.session;
    terminal?.signal('SIGTERM');
    this.terminals.delete(terminalId);
  }

  onTerminalExit(cb: (terminalId: string) => void): () => void {
    this.terminalExitCallbacks.add(cb);
    return () => this.terminalExitCallbacks.delete(cb);
  }

  async destroy(workspaceId: string): Promise<void> {
    for (const [terminalId, entry] of this.terminals) {
      if (entry.workspaceId === workspaceId) this.disposeTerminal(terminalId);
    }
    const runtimes = [...this.backends.entries()].filter(([key]) => key.startsWith(`${workspaceId}:`));
    await Promise.all(runtimes.map(([, runtime]) => runtime.destroy()));
    for (const [key] of runtimes) {
      this.backends.delete(key);
    }
  }

  async destroyAll(): Promise<void> {
    for (const terminalId of this.terminals.keys()) this.disposeTerminal(terminalId);
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
        return new MacHostBackend({
          workspaceId,
          hostWorkspacePath,
          workspaceManager: this.dependencies.workspaceManager,
        });
      case 'apple-container':
        return new AppleContainerBackend({
          workspaceId,
          hostWorkspacePath,
          workspaceManager: this.dependencies.workspaceManager,
          containerManager: this.dependencies.containerManager,
        });
      case 'docker':
        return new DockerBackend({
          workspaceId,
          hostWorkspacePath,
          workspaceManager: this.dependencies.workspaceManager,
          getGitAuthEnvVars: () => this.dependencies.containerManager.getExtraEnvVars?.() ?? {},
        });
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
