import type { ContainerManager } from '@electron/features/container';
import { containerManager } from '@electron/features/container/core/singleton';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import { workspaceManager } from '@electron/features/workspace/manager';
import { AppleContainerBackend } from './backends/apple-container-backend';
import { DockerBackend } from './backends/docker/docker-backend';
import { HostBackend } from './backends/host/host-backend';
import type { RuntimeBackend, RuntimeBackendId, RuntimeDevServerChangeEvent, RuntimeHealth, RuntimeTerminalSession } from './types';

export interface RuntimeManagerDependencies {
  workspaceManager: WorkspaceManager;
  containerManager: ContainerManager;
  resolveBackend?: (workspaceId: string) => Promise<RuntimeBackendId> | RuntimeBackendId;
  ensureHostSeroCliBridge?: () => Promise<void>;
}

export class RuntimeManager {
  private readonly backends = new Map<string, RuntimeBackend>();
  private readonly terminals = new Map<string, { workspaceId: string; session: RuntimeTerminalSession }>();
  private readonly terminalExitCallbacks = new Set<(terminalId: string) => void>();
  private readonly devServerCallbacks = new Set<(event: RuntimeDevServerChangeEvent) => void>();
  private readonly backendDevServerUnsubs = new Map<string, () => void>();
  private legacyDevServerUnsubscribe: (() => void) | undefined;

  constructor(private readonly dependencies: RuntimeManagerDependencies) {}

  setHostSeroCliBridgeStarter(starter: () => Promise<void>): void {
    this.dependencies.ensureHostSeroCliBridge = starter;
  }

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
    this.subscribeBackendDevServers(cacheKey, backend);
    if (backend.backend === 'host') this.purgeLegacyDevServersForHostWorkspace(workspaceId);
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
    name?: string;
    framework?: string;
    scope?: 'workspace' | 'card' | 'card-preview';
    cardId?: string;
    registeredAt?: string;
    status?: 'running' | 'stopped' | 'starting' | 'failed';
  }> {
    const runtimeServers = [...this.backends.entries()]
      .filter(([key]) => key.startsWith(`${workspaceId}:`))
      .flatMap(([, runtime]) => runtime.listDevServersSync?.() ?? []);
    const legacyServers = this.hasCachedRuntime(workspaceId, 'host')
      ? []
      : this.dependencies.containerManager.devServers?.list(workspaceId) ?? [];
    return [...runtimeServers, ...legacyServers].map((server) => ({
      id: server.id,
      port: server.port,
      url: server.url,
      command: server.command,
      cwd: server.cwd,
      name: server.name,
      framework: server.framework,
      scope: server.scope,
      cardId: server.cardId,
      registeredAt: server.registeredAt,
      status: server.status,
    }));
  }

  listAllDevServersSync(): Array<{
    workspaceId: string;
    id: string;
    port: number;
    url: string;
    command: string;
    cwd: string;
    name?: string;
    framework?: string;
    scope?: 'workspace' | 'card' | 'card-preview';
    cardId?: string;
    registeredAt?: string;
    status?: 'running' | 'stopped' | 'starting' | 'failed';
  }> {
    const runtimeServers = [...this.backends.entries()].flatMap(([key, runtime]) => {
      const workspaceId = workspaceIdFromCacheKey(key);
      return (runtime.listDevServersSync?.() ?? []).map((server) => ({ workspaceId, ...server }));
    });
    const legacyServers = (this.dependencies.containerManager.devServers?.list() ?? [])
      .filter((server) => !this.hasCachedRuntime(server.workspaceId, 'host'));
    return [...runtimeServers, ...legacyServers].map((server) => ({
      workspaceId: server.workspaceId,
      id: server.id,
      port: server.port,
      url: server.url,
      command: server.command,
      cwd: server.cwd,
      name: server.name,
      framework: server.framework,
      scope: server.scope,
      cardId: server.cardId,
      registeredAt: server.registeredAt,
      status: server.status,
    }));
  }

  onDevServerChange(cb: (event: RuntimeDevServerChangeEvent) => void): () => void {
    this.devServerCallbacks.add(cb);
    this.ensureLegacyDevServerSubscription();
    return () => {
      this.devServerCallbacks.delete(cb);
      if (this.devServerCallbacks.size === 0) this.clearLegacyDevServerSubscription();
    };
  }

  disposeTerminal(terminalId: string): void {
    const terminal = this.terminals.get(terminalId)?.session;
    terminal?.signal();
    this.terminals.delete(terminalId);
  }

  onTerminalExit(cb: (terminalId: string) => void): () => void {
    this.terminalExitCallbacks.add(cb);
    return () => this.terminalExitCallbacks.delete(cb);
  }

  async resetWorkspaceRuntime(workspaceId: string): Promise<void> {
    await this.destroy(workspaceId);
  }

  async destroy(workspaceId: string): Promise<void> {
    for (const [terminalId, entry] of this.terminals) {
      if (entry.workspaceId === workspaceId) this.disposeTerminal(terminalId);
    }
    const runtimes = [...this.backends.entries()].filter(([key]) => key.startsWith(`${workspaceId}:`));
    const results = await Promise.allSettled(runtimes.map(([, runtime]) => runtime.destroy()));
    for (const [key] of runtimes) {
      this.unsubscribeBackendDevServers(key);
      this.backends.delete(key);
    }
    throwFirstRejected(results);
  }

  async destroyAll(): Promise<void> {
    for (const terminalId of this.terminals.keys()) this.disposeTerminal(terminalId);
    const runtimes = [...this.backends.entries()];
    const results = await Promise.allSettled(runtimes.map(([, runtime]) => runtime.destroy()));
    for (const [key] of runtimes) this.unsubscribeBackendDevServers(key);
    this.backends.clear();
    throwFirstRejected(results);
  }

  private createBackend(
    backendId: RuntimeBackendId,
    workspaceId: string,
    hostWorkspacePath: string,
  ): RuntimeBackend {
    switch (backendId) {
      case 'host':
        return new HostBackend({
          workspaceId,
          hostWorkspacePath,
          workspaceManager: this.dependencies.workspaceManager,
          ensureSeroCliBridge: this.dependencies.ensureHostSeroCliBridge,
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

  private subscribeBackendDevServers(cacheKey: string, backend: RuntimeBackend): void {
    this.unsubscribeBackendDevServers(cacheKey);
    const unsubscribe = backend.onDevServerChange?.((event) => {
      if (backend.backend === 'host' && event.type === 'registered') {
        this.purgeLegacyDevServersForHostWorkspace(event.workspaceId);
      }
      this.emitDevServerChange(event);
    });
    if (unsubscribe) this.backendDevServerUnsubs.set(cacheKey, unsubscribe);
  }

  private unsubscribeBackendDevServers(cacheKey: string): void {
    this.backendDevServerUnsubs.get(cacheKey)?.();
    this.backendDevServerUnsubs.delete(cacheKey);
  }

  private emitDevServerChange(event: RuntimeDevServerChangeEvent): void {
    for (const cb of this.devServerCallbacks) cb(event);
  }

  private ensureLegacyDevServerSubscription(): void {
    if (this.legacyDevServerUnsubscribe) return;
    this.legacyDevServerUnsubscribe = this.dependencies.containerManager.devServers?.onChange?.((event) => {
      const normalized = normalizeLegacyDevServerEvent(event);
      if (this.hasCachedRuntime(normalized.workspaceId, 'host')) return;
      this.emitDevServerChange(normalized);
    });
  }

  private clearLegacyDevServerSubscription(): void {
    this.legacyDevServerUnsubscribe?.();
    this.legacyDevServerUnsubscribe = undefined;
  }

  private async resolveBackendId(workspaceId: string): Promise<RuntimeBackendId> {
    if (this.dependencies.resolveBackend) {
      return this.dependencies.resolveBackend(workspaceId);
    }

    return (await this.dependencies.workspaceManager.getRuntimeConfig(workspaceId)).backend;
  }

  private hasCachedRuntime(workspaceId: string, backendId: RuntimeBackendId): boolean {
    return this.backends.has(`${workspaceId}:${backendId}`);
  }

  private purgeLegacyDevServersForHostWorkspace(workspaceId: string): void {
    const legacyRegistry = this.dependencies.containerManager.devServers;
    const legacyServers = legacyRegistry?.list(workspaceId) ?? [];
    for (const server of legacyServers) {
      if (legacyRegistry?.unregister(server.id)) {
        this.emitDevServerChange({
          type: 'unregistered',
          workspaceId,
          serverId: server.id,
          status: 'stopped',
        });
      }
    }
  }
}

function normalizeLegacyDevServerEvent(event: {
  type: 'registered' | 'unregistered' | 'status_changed';
  serverId?: string;
  server?: {
    id: string;
    workspaceId: string;
    port: number;
    url: string;
    command: string;
    cwd: string;
    status?: RuntimeDevServerChangeEvent['status'];
  };
  status?: RuntimeDevServerChangeEvent['status'];
}): RuntimeDevServerChangeEvent {
  const workspaceId = event.server?.workspaceId ?? workspaceIdFromServerId(event.serverId ?? event.server?.id ?? '');
  return {
    type: event.type,
    workspaceId,
    serverId: event.serverId ?? event.server?.id,
    server: event.server ? {
      id: event.server.id,
      workspaceId: event.server.workspaceId,
      port: event.server.port,
      url: event.server.url,
      command: event.server.command,
      cwd: event.server.cwd,
      status: event.server.status,
    } : undefined,
    status: event.status ?? event.server?.status,
  };
}

function workspaceIdFromServerId(serverId: string): string {
  return serverId.split(':')[0] ?? '';
}

function workspaceIdFromCacheKey(cacheKey: string): string {
  return cacheKey.split(':')[0] ?? '';
}

function throwFirstRejected(results: PromiseSettledResult<unknown>[]): void {
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (!rejected) return;
  throw rejected.reason instanceof Error ? rejected.reason : new Error(String(rejected.reason));
}

export const runtimeManager = new RuntimeManager({
  workspaceManager,
  containerManager,
});
