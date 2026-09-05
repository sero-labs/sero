import type { WorkspaceManager } from '@electron/features/workspace/manager';
import { buildWorkspaceContainerConfig } from '@electron/features/container/core/workspace-container-config';
import type { ContainerConfig } from '@electron/features/container/core/types';
import { DEFAULT_IMAGE } from '@electron/features/container/core/types';
import { getRuntimeCapabilities } from '../../capabilities';
import { RUNTIME_WORKSPACE_PATH, toRuntimeWorkspacePath } from '../../runtime-paths';
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
} from '../../types';
import { runDocker, spawnDocker, type DockerRunner } from './docker-cli';
import { runDockerDoctorChecks } from './docker-doctor';
import { ensureDockerImage } from './docker-image';
import { dockerContainerName, ensureDockerContainer, removeDockerContainer, runtimeEnvArgs } from './docker-lifecycle';
import { DockerTerminalRegistry } from './docker-terminal';
import { DockerPortManager } from './docker-ports';
import { normalizePreviewPortPoolSize } from '../preview-port-pool';
import {
  dirname,
  emitData,
  isRuntimeDevServer,
  sanitizeLogPathSegment,
  shellQuote,
  sleep,
  subscribe,
} from './docker-backend-support';

interface DockerBackendOptions {
  workspaceId: string;
  hostWorkspacePath: string;
  workspaceManager: WorkspaceManager;
  getGitAuthEnvVars?: () => Record<string, string>;
  imageRef?: string;
  run?: DockerRunner;
}

export class DockerBackend implements RuntimeBackend {
  readonly backend = 'docker' as const;
  readonly workspaceId: string;
  readonly hostWorkspacePath: string;
  readonly runtimeWorkspacePath = RUNTIME_WORKSPACE_PATH;
  readonly workspaceAccess = 'live-mount' as const;
  readonly capabilities: RuntimeCapabilities = getRuntimeCapabilities('docker');

  private containerEnsured = false;
  private readonly workspaceManager: WorkspaceManager;
  private readonly getGitAuthEnvVars?: () => Record<string, string>;
  private readonly imageRef: string;
  private readonly run: DockerRunner;
  private readonly terminals = new DockerTerminalRegistry();
  private readonly devServerCallbacks = new Set<(event: RuntimeDevServerChangeEvent) => void>();
  private ports: DockerPortManager | null = null;
  private ensureInflight: { isolated: boolean; promise: Promise<RuntimeSession> } | null = null;

  constructor(options: DockerBackendOptions) {
    this.workspaceId = options.workspaceId;
    this.hostWorkspacePath = options.hostWorkspacePath;
    this.workspaceManager = options.workspaceManager;
    this.getGitAuthEnvVars = options.getGitAuthEnvVars;
    this.imageRef = options.imageRef ?? DEFAULT_IMAGE;
    this.run = options.run ?? runDocker;
  }

  async health(): Promise<RuntimeHealth> {
    const checks = await runDockerDoctorChecks({ imageRef: this.imageRef, run: this.run });
    const failing = checks.find((check) => check.status === 'fail');
    if (failing) {
      return { backend: this.backend, status: failing.id.endsWith('.cli') ? 'missing' : 'error', message: failing.message, checks };
    }
    const warning = checks.find((check) => check.status === 'warn');
    return { backend: this.backend, status: 'ready', message: warning?.message ?? 'Docker runtime is ready.', checks };
  }

  async ensure(): Promise<RuntimeSession> {
    return this.ensureWithOptions();
  }

  async destroy(): Promise<void> {
    this.terminals.disposeAll();
    for (const server of this.ports?.listServers() ?? []) {
      this.ports?.deleteServer(server.id);
      this.emitDevServerChange({
        type: 'unregistered',
        workspaceId: this.workspaceId,
        serverId: server.id,
        status: 'stopped',
      });
    }
    if (this.containerEnsured) {
      await removeDockerContainer(dockerContainerName(this.workspaceId), this.run);
      this.containerEnsured = false;
    }
  }

  async exec(input: RuntimeExecInput): Promise<RuntimeExecResult> {
    if (input.isolated === undefined) await this.ensure();
    else await this.ensureWithOptions({ isolated: input.isolated });
    const env = { ...(input.env ?? {}) };
    if (input.injectGitAuth && this.getGitAuthEnvVars) Object.assign(env, this.getGitAuthEnvVars());
    const args = [
      'exec', '-w', input.cwd ?? this.runtimeWorkspacePath,
      ...runtimeEnvArgs(env),
      dockerContainerName(this.workspaceId), 'sh', '-lc', input.command,
    ];
    return this.run(args, { timeoutMs: input.timeoutMs ?? 120_000 });
  }

  async execFile(input: RuntimeExecFileInput): Promise<RuntimeExecResult> {
    if (input.isolated === undefined) await this.ensure();
    else await this.ensureWithOptions({ isolated: input.isolated });
    const env = { ...(input.env ?? {}) };
    if (input.injectGitAuth && this.getGitAuthEnvVars) Object.assign(env, this.getGitAuthEnvVars());
    return this.run([
      'exec', '-w', input.cwd ?? this.runtimeWorkspacePath,
      ...runtimeEnvArgs(env),
      dockerContainerName(this.workspaceId), input.program, ...input.args,
    ], { timeoutMs: input.timeoutMs ?? 120_000 });
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
    const env = { ...(input.env ?? {}) };
    if (input.injectGitAuth && this.getGitAuthEnvVars) Object.assign(env, this.getGitAuthEnvVars());
    const child = spawnDocker([
      'exec', '-i', '-w', input.cwd ?? this.runtimeWorkspacePath,
      ...runtimeEnvArgs(env), dockerContainerName(this.workspaceId), 'sh', '-lc', input.command,
    ]);
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
      signal: (signal) => { child.kill(signal ?? 'SIGTERM'); },
      onData: (cb) => subscribe(dataCallbacks, cb),
      onExit: (cb) => subscribe(exitCallbacks, cb),
    };
  }

  async readFile(input: RuntimeReadFileInput): Promise<RuntimeFileReadResult> {
    const command = input.binary ? `base64 -w0 -- ${shellQuote(input.path)}` : `cat -- ${shellQuote(input.path)}`;
    const result = await this.exec({ command });
    if (result.exitCode !== 0) throw new Error(result.stderr || `Failed to read ${input.path}`);
    return { content: result.stdout, encoding: input.binary ? 'base64' : (input.encoding ?? 'utf8') };
  }

  async writeFile(input: RuntimeWriteFileInput): Promise<void> {
    await this.writeFileWith(input, { exclusive: false });
  }

  /**
   * Write a file, refusing an existing one when `exclusive` is set.
   *
   * `set -C` makes the shell open the target with O_EXCL, so the refusal
   * is the kernel's and two writers racing for one name cannot both win.
   */
  private async writeFileWith(input: RuntimeWriteFileInput, opts: { exclusive: boolean }): Promise<void> {
    const encoded = Buffer.from(input.content, input.encoding ?? 'utf8').toString('base64');
    const mode = input.mode ? ` && chmod ${input.mode.toString(8)} -- ${shellQuote(input.path)}` : '';
    const noClobber = opts.exclusive ? 'set -C && ' : '';
    const result = await this.exec({ command: `mkdir -p -- ${shellQuote(dirname(input.path))} && ${noClobber}printf %s ${shellQuote(encoded)} | base64 -d > ${shellQuote(input.path)}${mode}` });
    if (result.exitCode === 0) return;
    if (opts.exclusive && (await this.exec({ command: `test -e ${shellQuote(input.path)}` })).exitCode === 0) {
      throw Object.assign(new Error(`File already exists: ${input.path}`), { code: 'EEXIST' });
    }
    throw new Error(result.stderr || `Failed to write ${input.path}`);
  }

  async listFiles(input: RuntimeListFilesInput): Promise<RuntimeDirectoryEntry[]> {
    const depth = input.recursive ? '' : '-maxdepth 1';
    const result = await this.exec({ command: `find ${shellQuote(input.path)} ${depth} -mindepth 1 -printf '%f\t%p\t%y\t%s\n' | head -n ${input.limit ?? 1000}` });
    if (result.exitCode !== 0) throw new Error(result.stderr || `Failed to list ${input.path}`);
    return result.stdout.trim().split('\n').filter(Boolean).map((line) => {
      const [name = '', filePath = '', typeCode = 'f', size = '0'] = line.split('\t');
      return { name, path: filePath, type: typeCode === 'd' ? 'directory' : 'file', size: Number(size) || 0 };
    });
  }

  async rename(input: RuntimeRenameInput): Promise<void> {
    await this.expectOk(`mv -- ${shellQuote(input.oldPath)} ${shellQuote(input.newPath)}`);
  }

  async delete(input: RuntimeDeleteInput): Promise<void> {
    await this.expectOk(`rm ${input.recursive ? '-rf' : '-f'} -- ${shellQuote(input.path)}`);
  }

  async createFile(input: RuntimeCreateFileInput): Promise<void> {
    await this.writeFileWith(input, { exclusive: input.overwrite === false });
  }

  async createDirectory(input: RuntimeCreateDirectoryInput): Promise<void> {
    await this.expectOk(`mkdir ${input.recursive ? '-p ' : ''}-- ${shellQuote(input.path)}`);
  }

  async watchFiles(_input: RuntimeFileWatchInput): Promise<RuntimeFileWatch> {
    throw new Error('Docker runtime file watching is not implemented yet.');
  }

  async createTerminal(input: RuntimeTerminalInput): Promise<RuntimeTerminalSession> {
    await this.ensure();
    return this.terminals.create(this.workspaceId, input.terminalId, input.cwd ?? this.runtimeWorkspacePath, input.cols, input.rows);
  }

  async startDevServer(input: RuntimeDevServerStartInput): Promise<RuntimeDevServer> {
    await this.ensure();
    const ports = await this.portManager();
    const beforePorts = new Set(await ports.detectPorts());
    const cwd = this.devServerCwd(input.cwd);
    const logPath = input.logPath ?? this.defaultDevServerLogPath(input);
    const command = `setsid sh -c ${shellQuote(`${input.command} > ${shellQuote(logPath)} 2>&1 &`)}`;
    const result = await this.exec({ command, cwd, timeoutMs: 30_000 });
    if (result.exitCode !== 0) throw new Error(`Dev server start failed: ${result.stderr || result.stdout || input.command}`);
    const port = await this.waitForStartedPort(beforePorts);
    const forwarded = await ports.forwardPort(port);
    const server = ports.registerServer({
      id: `${this.workspaceId}:${input.scope ?? 'workspace'}:${input.cardId ?? 'root'}:${port}`,
      port,
      url: forwarded.url,
      command: input.command,
      cwd,
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
    const cwd = this.devServerCwd(input.cwd);
    const forwarded = await ports.forwardPort(input.port);
    const server = ports.registerServer({
      id: `${this.workspaceId}:${input.scope ?? 'workspace'}:${input.cardId ?? 'root'}:${input.port}`,
      port: input.port,
      url: forwarded.url,
      command: input.command,
      cwd,
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
    if (server.status !== 'stopped') {
      await this.killPort(server.port);
      await ports.stopForward(server.port);
    }
    ports.registerServer({ ...server, status: 'stopped' });
    this.emitDevServerChange({
      type: 'status_changed',
      workspaceId: this.workspaceId,
      serverId: input.serverId,
      status: 'stopped',
    });
  }

  async unregisterDevServer(input: RuntimeDevServerStopInput): Promise<void> {
    const ports = await this.portManager();
    if (!ports.deleteServer(input.serverId)) throw new Error(`Dev server not found: ${input.serverId}`);
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
    if (server.status !== 'stopped') await this.stopDevServer(input);
    const restarted = await this.startDevServer({
      command: server.command,
      cwd: server.cwd,
      name: server.name,
      framework: server.framework,
      scope: server.scope,
      cardId: server.cardId,
    });
    if (restarted.id !== input.serverId && ports.getServer(input.serverId)) await this.unregisterDevServer(input);
    return restarted;
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

  private devServerCwd(cwd?: string): string {
    if (!cwd) return this.runtimeWorkspacePath;
    return toRuntimeWorkspacePath(this.hostWorkspacePath, cwd) ?? cwd;
  }

  private defaultDevServerLogPath(input: RuntimeDevServerStartInput): string {
    const workspaceId = sanitizeLogPathSegment(this.workspaceId);
    const scope = sanitizeLogPathSegment(input.scope ?? 'workspace');
    const cardId = sanitizeLogPathSegment(input.cardId ?? 'root');
    return `/tmp/sero-dev-server-${workspaceId}-${scope}-${cardId}-${Date.now()}.log`;
  }

  private async ensureWithOptions(options?: { isolated?: boolean }): Promise<RuntimeSession> {
    const isolated = options?.isolated === true;
    if (this.ensureInflight?.isolated === isolated) return this.ensureInflight.promise;
    if (this.ensureInflight) {
      await this.ensureInflight.promise;
      if (this.ensureInflight?.isolated === isolated) return this.ensureInflight.promise;
    }
    const promise = this.ensureOnce(options).finally(() => { this.ensureInflight = null; });
    this.ensureInflight = { isolated, promise };
    return promise;
  }

  private async ensureOnce(options?: { isolated?: boolean }): Promise<RuntimeSession> {
    const [image, config, poolSize] = await Promise.all([
      ensureDockerImage({ imageRef: this.imageRef, run: this.run }),
      this.buildConfig(options),
      this.previewPortPoolSize(),
    ]);
    let state = await ensureDockerContainer({ config, imageRef: this.imageRef, imageId: image.imageId, run: this.run, previewPortPoolSize: poolSize });
    try {
      await (await this.portManager(poolSize)).refreshFromInspect();
    } catch {
      await removeDockerContainer(dockerContainerName(this.workspaceId), this.run);
      state = await ensureDockerContainer({ config, imageRef: this.imageRef, imageId: image.imageId, run: this.run, previewPortPoolSize: poolSize });
      await (await this.portManager(poolSize)).refreshFromInspect();
    }
    this.containerEnsured = true;
    return {
      backend: this.backend,
      workspaceId: this.workspaceId,
      hostWorkspacePath: this.hostWorkspacePath,
      runtimeWorkspacePath: this.runtimeWorkspacePath,
      state: state.state,
      containerId: state.id,
    };
  }

  private async portManager(poolSize?: number): Promise<DockerPortManager> {
    if (!this.ports) {
      const resolvedPoolSize = poolSize ?? await this.previewPortPoolSize();
      this.ports = new DockerPortManager({
        workspaceId: this.workspaceId,
        poolSize: resolvedPoolSize,
        run: this.run,
        exec: (command, timeoutMs) => this.run(['exec', dockerContainerName(this.workspaceId), 'sh', '-lc', command], { timeoutMs }),
      });
    }
    return this.ports;
  }

  private async previewPortPoolSize(): Promise<number> {
    const config = await this.workspaceManager.getRuntimeConfig(this.workspaceId);
    return normalizePreviewPortPoolSize(config.previewPortPoolSize);
  }

  private async waitForStartedPort(beforePorts: Set<number>): Promise<number> {
    const startedAt = Date.now();
    const poll = async (): Promise<number> => {
      if (Date.now() - startedAt >= 20_000) {
        throw new Error('No dev server port was detected after starting the command.');
      }
      await sleep(500);
      const ports = await (await this.portManager()).detectPorts();
      const port = ports.find((candidate) => !beforePorts.has(candidate));
      if (port) return port;
      return poll();
    };

    return poll();
  }

  private async killPort(port: number): Promise<void> {
    await this.exec({ command: `pids=$(ss -tlnp sport = :${port} 2>/dev/null | grep -oP 'pid=\\K[0-9]+' | sort -u); [ -z "$pids" ] || kill $pids 2>/dev/null || true`, timeoutMs: 10_000 });
  }

  private async buildConfig(options?: { isolated?: boolean }): Promise<ContainerConfig> {
    return buildWorkspaceContainerConfig(
      this.workspaceManager,
      this.workspaceId,
      this.hostWorkspacePath,
      options?.isolated === undefined ? undefined : { isolated: options.isolated },
    );
  }

  private async expectOk(command: string): Promise<void> {
    const result = await this.exec({ command });
    if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout || `Command failed: ${command}`);
  }

  private emitDevServerChange(event: RuntimeDevServerChangeEvent): void {
    for (const cb of this.devServerCallbacks) cb(event);
  }
}
