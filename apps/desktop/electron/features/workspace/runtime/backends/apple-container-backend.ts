import { spawn as spawnProcess } from 'child_process';
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
  RuntimeDevServerChangeEvent,
  RuntimeDevServerRegisterInput,
  RuntimeDevServerRestartInput,
  RuntimeDevServerStartInput,
  RuntimeDevServerStatus,
  RuntimeDevServerStatusInput,
  RuntimeDevServerStopInput,
  RuntimeDirectoryEntry,
  RuntimeExecFileInput,
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
import { AppleContainerPortManager } from './apple-container-ports';
import { normalizePreviewPortPoolSize } from './preview-port-pool';

const DEV_SERVER_START_TIMEOUT_MS = 30_000;
const DEV_SERVER_DETECT_TIMEOUT_MS = 20_000;
const DEV_SERVER_POLL_MS = 500;
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface AppleContainerBackendOptions {
  workspaceId: string;
  hostWorkspacePath: string;
  workspaceManager: WorkspaceManager;
  containerManager: ContainerManager;
  inspectApplePorts?: () => Promise<unknown>;
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
  private readonly inspectApplePorts?: () => Promise<unknown>;
  private readonly devServerCallbacks = new Set<(event: RuntimeDevServerChangeEvent) => void>();
  private ports: AppleContainerPortManager | null = null;
  private session: RuntimeSession | null = null;
  private ensureInflight: Promise<RuntimeSession> | null = null;

  constructor(options: AppleContainerBackendOptions) {
    this.workspaceId = options.workspaceId;
    this.hostWorkspacePath = options.hostWorkspacePath;
    this.workspaceManager = options.workspaceManager;
    this.containerManager = options.containerManager;
    this.inspectApplePorts = options.inspectApplePorts;
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
    return this.ensureWithOptions();
  }

  private async ensureWithOptions(options?: { isolated?: boolean }): Promise<RuntimeSession> {
    if (this.session) return this.session;
    if (this.ensureInflight) return this.ensureInflight;
    this.ensureInflight = this.ensureOnce(options).finally(() => { this.ensureInflight = null; });
    return this.ensureInflight;
  }

  private async ensureOnce(options?: { isolated?: boolean }): Promise<RuntimeSession> {
    const config = await buildWorkspaceContainerConfig(
      this.workspaceManager,
      this.workspaceId,
      this.hostWorkspacePath,
      options?.isolated === undefined ? undefined : { isolated: options.isolated },
    );
    const ports = await this.portManager();
    config.previewPortMappings = await ports.prepareRunMappings();
    let state = await this.containerManager.ensure(config);
    try {
      await ports.refreshFromInspect();
    } catch {
      await this.containerManager.remove(this.workspaceId);
      state = await this.containerManager.ensure(config);
      await ports.refreshFromInspect();
    }
    this.session = {
      backend: this.backend,
      workspaceId: this.workspaceId,
      hostWorkspacePath: this.hostWorkspacePath,
      runtimeWorkspacePath: this.runtimeWorkspacePath,
      state: state.state,
      containerId: state.id,
    };
    return this.session;
  }

  async destroy(): Promise<void> {
    this.containerManager.terminals.disposeWorkspaceTerminals(this.workspaceId);
    for (const server of this.ports?.listServers() ?? []) {
      this.ports?.deleteServer(server.id);
      this.emitDevServerChange({
        type: 'unregistered',
        workspaceId: this.workspaceId,
        serverId: server.id,
        status: 'stopped',
      });
    }
    // Mirror the Docker backend: destroy fully removes the container rather than just stopping
    // it, so stale Apple Container records do not accumulate across workspace resets.
    await this.containerManager.remove(this.workspaceId);
    this.session = null;
  }

  async exec(input: RuntimeExecInput): Promise<RuntimeExecResult> {
    if (input.isolated === undefined) await this.ensure();
    else await this.ensureWithOptions({ isolated: input.isolated });
    return this.containerManager.exec(
      this.workspaceId,
      input.command,
      input.cwd ?? this.runtimeWorkspacePath,
      input.timeoutMs,
      { injectGitAuth: input.injectGitAuth },
    );
  }

  async execFile(input: RuntimeExecFileInput): Promise<RuntimeExecResult> {
    const envPrefix = Object.entries(input.env ?? {})
      .map(([key, value]) => shellEnvAssignment(key, value))
      .join(' ');
    const command = [input.program, ...input.args].map(shellQuote).join(' ');
    await this.ensure();
    return this.containerManager.exec(
      this.workspaceId,
      envPrefix ? `${envPrefix} ${command}` : command,
      input.cwd ?? this.runtimeWorkspacePath,
      input.timeoutMs,
      { injectGitAuth: input.injectGitAuth },
    );
  }

  async isSshAvailable(): Promise<boolean> {
    const result = await this.execFile({
      program: 'ssh',
      args: ['-T', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=5', 'git@github.com'],
      timeoutMs: 10_000,
    });
    return result.stderr.includes('successfully authenticated');
  }

  async spawn(input: RuntimeProcessInput): Promise<RuntimeProcess> {
    await this.ensure();
    const envFlags = Object.entries(input.env ?? {}).flatMap(([key, value]) => {
      if (!ENV_KEY_RE.test(key)) throw new Error(`Invalid environment variable name: ${key}`);
      return ['-e', `${key}=${value}`];
    });
    // Match the Docker backend's login-shell semantics (`sh -lc`) so dev-server commands see the
    // same profile/PATH on both container runtimes.
    const child = spawnProcess(CONTAINER_BIN, [
      'exec', '-i', '-w', input.cwd ?? this.runtimeWorkspacePath,
      ...envFlags,
      containerId(this.workspaceId), 'sh', '-lc', input.command,
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
    if (input.binary) {
      const result = await this.exec({ command: `base64 -w0 -- ${shellQuote(input.path)}` });
      if (result.exitCode !== 0) throw new Error(`Failed to read ${input.path}: ${result.stderr || result.stdout}`);
      return { content: result.stdout, encoding: 'base64' };
    }
    const content = await this.containerManager.readFile(this.workspaceId, input.path);
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
    await this.expectOk(`mv -- ${shellQuote(input.oldPath)} ${shellQuote(input.newPath)}`);
  }

  async delete(input: RuntimeDeleteInput): Promise<void> {
    const flag = input.recursive ? '-rf' : '-f';
    await this.expectOk(`rm ${flag} -- ${shellQuote(input.path)}`);
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
    await this.expectOk(`mkdir ${flag}-- ${shellQuote(input.path)}`);
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
    const ports = await this.portManager();
    const beforePorts = new Set(await ports.detectPorts());
    const command = buildDevServerLaunchCommand(input.command, input.logPath ?? '/tmp/sero-dev-server.log');
    const result = await this.containerManager.exec(
      this.workspaceId,
      command,
      input.cwd || this.runtimeWorkspacePath,
      DEV_SERVER_START_TIMEOUT_MS,
    );
    if (result.exitCode !== 0) throw new Error(`Dev server start failed: ${result.stderr || result.stdout || input.command}`);
    const pid = Number(result.stdout.trim().split('\n').pop());
    if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Dev server start did not return a process id: ${result.stdout || input.command}`);
    const port = await this.waitForStartedPort(beforePorts, pid);
    const forwarded = await ports.forwardPort(port);
    const server = ports.registerServer({
      id: `${this.workspaceId}:${input.scope ?? 'workspace'}:${input.cardId ?? 'root'}:${port}`,
      port,
      url: forwarded.url,
      command: input.command,
      cwd: input.cwd || this.runtimeWorkspacePath,
      name: input.name,
      framework: input.framework,
      scope: input.scope ?? 'workspace',
      cardId: input.cardId,
      registeredAt: new Date().toISOString(),
      status: 'running',
    });
    this.emitDevServerChange({
      type: 'registered',
      workspaceId: this.workspaceId,
      serverId: server.id,
      server: { ...server, workspaceId: this.workspaceId },
      status: 'running',
    });
    return server;
  }

  async registerDevServer(input: RuntimeDevServerRegisterInput): Promise<RuntimeDevServer> {
    await this.ensure();
    const ports = await this.portManager();
    const forwarded = await ports.forwardPort(input.port);
    const server = ports.registerServer({
      id: `${this.workspaceId}:${input.scope ?? 'workspace'}:${input.cardId ?? 'root'}:${input.port}`,
      port: input.port,
      url: forwarded.url,
      command: input.command,
      cwd: input.cwd || this.runtimeWorkspacePath,
      name: input.name,
      framework: input.framework,
      scope: input.scope ?? 'workspace',
      cardId: input.cardId,
      registeredAt: new Date().toISOString(),
      status: 'running',
    });
    this.emitDevServerChange({
      type: 'registered',
      workspaceId: this.workspaceId,
      serverId: server.id,
      server: { ...server, workspaceId: this.workspaceId },
      status: 'running',
    });
    return server;
  }

  async stopDevServer(input: RuntimeDevServerStopInput): Promise<void> {
    const ports = await this.portManager();
    const server = ports.getServer(input.serverId);
    if (!server) throw new Error(`Dev server not found: ${input.serverId}`);
    await this.killPort(server.port);
    await ports.stopForward(server.port);
    ports.deleteServer(input.serverId);
    this.emitDevServerChange({
      type: 'unregistered',
      workspaceId: this.workspaceId,
      serverId: input.serverId,
      status: 'stopped',
    });
  }

  async restartDevServer(input: RuntimeDevServerRestartInput): Promise<RuntimeDevServer> {
    const ports = await this.portManager();
    const server = ports.getServer(input.serverId);
    if (!server) throw new Error(`Dev server not found: ${input.serverId}`);
    await this.stopDevServer(input);
    return this.startDevServer({
      command: server.command,
      cwd: server.cwd,
      name: server.name,
      framework: server.framework,
      scope: server.scope,
      cardId: server.cardId,
    });
  }

  async getDevServerStatus(input: RuntimeDevServerStatusInput): Promise<RuntimeDevServerStatus> {
    const ports = await this.portManager();
    return { servers: input.serverId ? [ports.getServer(input.serverId)].filter(isRuntimeDevServer) : ports.listServers() };
  }

  listDevServersSync(): RuntimeDevServer[] {
    return this.ports?.listServers() ?? [];
  }

  onDevServerChange(cb: (event: RuntimeDevServerChangeEvent) => void): () => void {
    this.devServerCallbacks.add(cb);
    return () => this.devServerCallbacks.delete(cb);
  }

  async forwardPort(input: RuntimeForwardPortInput): Promise<RuntimeForwardedPort> {
    await this.ensure();
    return (await this.portManager()).forwardPort(input.targetPort);
  }

  async stopForward(input: RuntimeStopForwardInput): Promise<void> {
    await (await this.portManager()).stopForward(input.targetPort, input.hostPort);
  }

  async resolvePreviewUrl(input: RuntimePreviewUrlInput): Promise<RuntimePreviewUrl> {
    await this.ensure();
    return (await this.portManager()).resolvePreviewUrl(input.targetPort, input.path);
  }

  private async waitForStartedPort(beforePorts: Set<number>, pid: number): Promise<number> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < DEV_SERVER_DETECT_TIMEOUT_MS) {
      await sleep(DEV_SERVER_POLL_MS);
      if (!await this.isProcessAlive(pid)) throw new Error(`Dev server exited before a listening port was detected (pid ${pid}).`);
      const ports = await (await this.portManager()).detectPorts();
      const port = ports.find((candidate) => !beforePorts.has(candidate));
      if (port) return port;
    }
    throw new Error('No dev server port was detected after starting the command.');
  }

  private async isProcessAlive(pid: number): Promise<boolean> {
    const result = await this.containerManager.exec(this.workspaceId, `kill -0 ${pid} 2>/dev/null`, this.runtimeWorkspacePath, 5_000);
    return result.exitCode === 0;
  }

  private async portManager(): Promise<AppleContainerPortManager> {
    if (!this.ports) {
      const config = await this.workspaceManager.getRuntimeConfig(this.workspaceId);
      this.ports = new AppleContainerPortManager({
        workspaceId: this.workspaceId,
        poolSize: normalizePreviewPortPoolSize(config.previewPortPoolSize),
        exec: (command, timeoutMs) => this.containerManager.exec(this.workspaceId, command, this.runtimeWorkspacePath, timeoutMs),
        inspect: this.inspectApplePorts,
      });
    }
    return this.ports;
  }

  private async killPort(port: number): Promise<void> {
    await this.containerManager.exec(this.workspaceId, `pids=$(ss -tlnp sport = :${port} 2>/dev/null | grep -oP 'pid=\\K[0-9]+' | sort -u); [ -z "$pids" ] || kill $pids 2>/dev/null || true`, this.runtimeWorkspacePath, 10_000);
  }

  private async expectOk(command: string): Promise<void> {
    const result = await this.exec({ command });
    if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout || `Command failed: ${command}`);
  }

  private emitDevServerChange(event: RuntimeDevServerChangeEvent): void {
    for (const cb of this.devServerCallbacks) cb(event);
  }
}

function isRuntimeDevServer(server: RuntimeDevServer | undefined): server is RuntimeDevServer {
  return Boolean(server);
}

function shellEnvAssignment(key: string, value: string): string {
  if (!ENV_KEY_RE.test(key)) throw new Error(`Invalid environment variable name: ${key}`);
  return `${key}=${shellQuote(value)}`;
}

function buildDevServerLaunchCommand(command: string, logPath: string): string {
  return `setsid sh -c ${shellQuote(`exec ${command} > ${shellQuote(logPath)} 2>&1`)} >/dev/null 2>&1 & echo $!`;
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
