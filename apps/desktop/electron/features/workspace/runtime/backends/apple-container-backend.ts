import { spawn as spawnProcess } from 'child_process';
import type { DevServer } from '@/types/ipc';
import type { ContainerManager } from '@electron/features/container';
import { CONTAINER_BIN, containerId } from '@electron/features/container/core/types';
import { buildWorkspaceContainerConfig } from '@electron/features/container/core/workspace-container-config';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import { getRuntimeCapabilities } from '../capabilities';
import { RUNTIME_WORKSPACE_PATH } from '../runtime-paths';
import type {
  RuntimeBackend,
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
  RuntimeWriteFileInput,
} from '../types';

const DEV_SERVER_START_TIMEOUT_MS = 30_000;
const DEV_SERVER_DETECT_TIMEOUT_MS = 20_000;
const DEV_SERVER_POLL_MS = 500;

interface AppleContainerBackendOptions {
  workspaceId: string;
  hostWorkspacePath: string;
  workspaceManager: WorkspaceManager;
  containerManager: ContainerManager;
}

export class AppleContainerBackend implements RuntimeBackend {
  readonly backend = 'apple-container' as const;
  readonly workspaceId: string;
  readonly hostWorkspacePath: string;
  readonly runtimeWorkspacePath = RUNTIME_WORKSPACE_PATH;
  readonly workspaceAccess = 'live-mount' as const;
  readonly capabilities: RuntimeCapabilities = getRuntimeCapabilities('apple-container');

  private readonly workspaceManager: WorkspaceManager;
  private readonly containerManager: ContainerManager;

  constructor(options: AppleContainerBackendOptions) {
    this.workspaceId = options.workspaceId;
    this.hostWorkspacePath = options.hostWorkspacePath;
    this.workspaceManager = options.workspaceManager;
    this.containerManager = options.containerManager;
  }

  async health(): Promise<RuntimeHealth> {
    try {
      await this.containerManager.ensureSystemRunning();
      return { backend: this.backend, status: 'ready', message: 'Apple Container runtime is ready.' };
    } catch (err: unknown) {
      return {
        backend: this.backend,
        status: 'missing',
        message: 'Apple Container runtime is not available.',
        detail: errorMessage(err),
      };
    }
  }

  async ensure(): Promise<RuntimeSession> {
    const config = await buildWorkspaceContainerConfig(
      this.workspaceManager,
      this.workspaceId,
      this.hostWorkspacePath,
    );
    const state = await this.containerManager.ensure(config);
    return {
      backend: this.backend,
      workspaceId: this.workspaceId,
      hostWorkspacePath: this.hostWorkspacePath,
      runtimeWorkspacePath: this.runtimeWorkspacePath,
      state: state.state,
      containerId: state.id,
    };
  }

  async destroy(): Promise<void> {
    this.containerManager.terminals.disposeWorkspaceTerminals(this.workspaceId);
    await this.containerManager.stop(this.workspaceId);
  }

  async exec(input: RuntimeExecInput): Promise<RuntimeExecResult> {
    await this.ensure();
    return this.containerManager.exec(
      this.workspaceId,
      input.command,
      input.cwd ?? this.runtimeWorkspacePath,
      input.timeoutMs,
      { injectGitAuth: input.injectGitAuth },
    );
  }

  async spawn(input: RuntimeProcessInput): Promise<RuntimeProcess> {
    await this.ensure();
    const envFlags = Object.entries(input.env ?? {}).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
    const child = spawnProcess(CONTAINER_BIN, [
      'exec', '-i', '-w', input.cwd ?? this.runtimeWorkspacePath,
      ...envFlags,
      containerId(this.workspaceId), 'sh', '-c', input.command,
    ], { stdio: input.stdio === 'inherit' ? 'inherit' : 'pipe' });
    const dataCallbacks = new Set<(chunk: string) => void>();
    const exitCallbacks = new Set<(exit: { exitCode: number | null; signal?: string }) => void>();
    child.stdout?.on('data', (chunk: Buffer) => emitData(dataCallbacks, chunk));
    child.stderr?.on('data', (chunk: Buffer) => emitData(dataCallbacks, chunk));
    child.on('exit', (exitCode, signal) => {
      for (const cb of exitCallbacks) cb({ exitCode, signal: signal ?? undefined });
    });
    return {
      pid: child.pid,
      write: (chunk) => { child.stdin?.write(chunk); },
      signal: (signal) => { child.kill(signal); },
      onData: (cb) => subscribe(dataCallbacks, cb),
      onExit: (cb) => subscribe(exitCallbacks, cb),
    };
  }

  async readFile(input: RuntimeReadFileInput): Promise<RuntimeFileReadResult> {
    await this.ensure();
    const content = await this.containerManager.readFile(this.workspaceId, input.path);
    if (input.binary) return { content: Buffer.from(content).toString('base64'), encoding: 'base64' };
    return { content, encoding: input.encoding ?? 'utf8' };
  }

  async writeFile(input: RuntimeWriteFileInput): Promise<void> {
    await this.ensure();
    await this.containerManager.writeFile(this.workspaceId, input.path, input.content);
  }

  async listFiles(input: RuntimeListFilesInput): Promise<RuntimeDirectoryEntry[]> {
    await this.ensure();
    if (input.recursive) {
      throw new Error('Apple Container recursive file listing is not implemented yet.');
    }
    const entries = await this.containerManager.listFiles(this.workspaceId, input.path);
    return entries.slice(0, input.limit).map((entry) => ({
      name: entry.name,
      path: `${input.path.replace(/\/$/, '')}/${entry.name}`,
      type: entry.type,
      size: entry.size,
    }));
  }

  async rename(input: RuntimeRenameInput): Promise<void> {
    await this.exec({ command: `mv -- ${shellQuote(input.oldPath)} ${shellQuote(input.newPath)}` });
  }

  async delete(input: RuntimeDeleteInput): Promise<void> {
    const flag = input.recursive ? '-rf' : '-f';
    await this.exec({ command: `rm ${flag} -- ${shellQuote(input.path)}` });
  }

  async createFile(input: RuntimeCreateFileInput): Promise<void> {
    if (input.overwrite === false) {
      const result = await this.exec({ command: `test ! -e ${shellQuote(input.path)}` });
      if (result.exitCode !== 0) throw new Error(`File already exists: ${input.path}`);
    }
    await this.writeFile(input);
  }

  async createDirectory(input: RuntimeCreateDirectoryInput): Promise<void> {
    const flag = input.recursive ? '-p ' : '';
    await this.exec({ command: `mkdir ${flag}-- ${shellQuote(input.path)}` });
  }

  async watchFiles(_input: RuntimeFileWatchInput): Promise<RuntimeFileWatch> {
    throw new Error('Apple Container runtime file watching is not implemented yet.');
  }

  async createTerminal(input: RuntimeTerminalInput): Promise<RuntimeTerminalSession> {
    await this.ensure();
    const terminal = this.containerManager.terminals.createTerminal(
      this.workspaceId,
      input.terminalId,
      input.cols,
      input.rows,
    );
    return {
      terminalId: input.terminalId,
      pid: terminal.pid,
      write: (chunk) => terminal.write(chunk),
      resize: (cols, rows) => terminal.resize(cols, rows),
      signal: (signal) => { if (typeof signal === 'string') terminal.kill(signal); else terminal.kill(); },
      onData: (cb) => terminal.onData(cb).dispose,
      onExit: (cb) => terminal.onExit((event) => cb({
        exitCode: event.exitCode,
        signal: event.signal === undefined ? undefined : String(event.signal),
      })).dispose,
      replayBuffer: () => this.containerManager.terminals.getReplayBuffer(input.terminalId),
    };
  }

  async startDevServer(input: RuntimeDevServerStartInput): Promise<RuntimeDevServer> {
    await this.ensure();
    const beforePorts = new Set(this.containerManager.portScanner.getPorts(this.workspaceId).map((port) => port.port));
    const command = `setsid sh -c ${shellQuote(`${input.command} > ${input.logPath ?? '/tmp/sero-dev-server.log'} 2>&1 &`)}`;
    const result = await this.containerManager.exec(
      this.workspaceId,
      command,
      input.cwd || this.runtimeWorkspacePath,
      DEV_SERVER_START_TIMEOUT_MS,
    );
    if (result.exitCode !== 0) {
      throw new Error(`Dev server start failed: ${result.stderr || result.stdout || input.command}`);
    }

    const port = await this.waitForStartedPort(beforePorts);
    const server = this.containerManager.devServers.register({
      workspaceId: this.workspaceId,
      name: input.name ?? 'Dev Server',
      port,
      command: input.command,
      framework: input.framework,
      cwd: input.cwd || this.runtimeWorkspacePath,
      scope: input.scope === 'card' ? 'card-preview' : input.scope,
      cardId: input.cardId,
    });
    return toRuntimeDevServer(server);
  }

  async stopDevServer(input: RuntimeDevServerStopInput): Promise<void> {
    const stopped = await this.containerManager.devServers.stop(input.serverId);
    if (!stopped) throw new Error(`Dev server not found: ${input.serverId}`);
  }

  async restartDevServer(input: RuntimeDevServerRestartInput): Promise<RuntimeDevServer> {
    const restarted = await this.containerManager.devServers.restart(input.serverId);
    const server = this.containerManager.devServers.get(input.serverId);
    if (!restarted || !server) throw new Error(`Dev server not found: ${input.serverId}`);
    return toRuntimeDevServer(server);
  }

  async getDevServerStatus(input: RuntimeDevServerStatusInput): Promise<RuntimeDevServerStatus> {
    const servers = input.serverId
      ? [this.containerManager.devServers.get(input.serverId)].filter(isDevServer)
      : this.containerManager.devServers.list(this.workspaceId);
    return { servers: servers.map(toRuntimeDevServer) };
  }

  async forwardPort(input: RuntimeForwardPortInput): Promise<RuntimeForwardedPort> {
    await this.ensure();
    this.containerManager.portScanner.triggerScan(this.workspaceId);
    const port = this.containerManager.portScanner.getPorts(this.workspaceId).find((candidate) => (
      candidate.port === input.targetPort
    ));
    if (!port) throw new Error(`Port ${input.targetPort} is not currently detected in Apple Container.`);
    return { targetPort: input.targetPort, hostPort: input.targetPort, url: port.url, bridged: port.bridged };
  }

  async stopForward(_input: RuntimeStopForwardInput): Promise<void> {
    this.containerManager.portScanner.triggerScan(this.workspaceId);
  }

  async resolvePreviewUrl(input: RuntimePreviewUrlInput): Promise<RuntimePreviewUrl> {
    const forwarded = await this.forwardPort({ targetPort: input.targetPort, protocol: 'http' });
    const suffix = input.path ?? '';
    return {
      url: `${forwarded.url}${suffix}`,
      targetPort: input.targetPort,
      hostPort: forwarded.hostPort,
      backend: this.backend,
    };
  }

  private async waitForStartedPort(beforePorts: Set<number>): Promise<number> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < DEV_SERVER_DETECT_TIMEOUT_MS) {
      this.containerManager.portScanner.triggerScan(this.workspaceId);
      await sleep(DEV_SERVER_POLL_MS);
      const port = this.containerManager.portScanner
        .getPorts(this.workspaceId)
        .find((candidate) => !beforePorts.has(candidate.port));
      if (port) return port.port;
    }
    throw new Error('No dev server port was detected after starting the command.');
  }
}

function toRuntimeDevServer(server: DevServer): RuntimeDevServer {
  return {
    id: server.id,
    port: server.port,
    url: server.url,
    command: server.command,
    cwd: server.cwd,
  };
}

function isDevServer(server: DevServer | undefined): server is DevServer {
  return Boolean(server);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function emitData(callbacks: Set<(chunk: string) => void>, chunk: Buffer): void {
  const text = chunk.toString();
  for (const cb of callbacks) cb(text);
}

function subscribe<T>(callbacks: Set<(value: T) => void>, cb: (value: T) => void): () => void {
  callbacks.add(cb);
  return () => callbacks.delete(cb);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
