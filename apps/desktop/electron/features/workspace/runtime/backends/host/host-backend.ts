import { spawn as spawnProcess } from 'child_process';
import path from 'path';

import { TerminalManager } from '@electron/features/container/terminal';
import { seroOwnedProcesses } from '@electron/features/git/worktree/pool/owned-processes';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import { getRuntimeCapabilities } from '../../capabilities';
import { RUNTIME_WORKSPACE_PATH, isRuntimeWorkspacePath, toHostWorkspacePath, toRuntimeWorkspacePath } from '../../runtime-paths';
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
import type { HostRuntimeSubstrate } from './host-substrate';
import { createHostSubstrate } from './host-substrate-factory';
import { checkBrowserPackDoctor } from '../../browser-pack/doctor';
import { HostDevServerManager } from './host-dev-server-manager';
import { runHostDoctorChecks } from './host-doctor';
import { createHostProcessAdapter } from './process/factory';
import { createHostProcessEnv } from './host-env';
import { trackedExecFile } from './tracked-exec';

function getSeroAgentRootPath(): string | null {
  const explicitAgentDir = process.env.PI_CODING_AGENT_DIR;
  if (explicitAgentDir) return explicitAgentDir;
  const seroHome = process.env.SERO_HOME;
  return seroHome ? path.join(seroHome, 'agent') : null;
}

export interface HostBackendOptions {
  workspaceId: string;
  hostWorkspacePath: string;
  workspaceManager?: Pick<WorkspaceManager, 'getRoots'>;
  substrate?: HostRuntimeSubstrate;
  ensureSeroCliBridge?: () => Promise<void>;
}

interface HostPathResolution {
  hostPath: string;
  rootHostPath: string;
  returnHostPaths: boolean;
}

export class HostBackend implements RuntimeBackend {
  readonly backend = 'host' as const;
  readonly workspaceId: string;
  readonly hostWorkspacePath: string;
  readonly runtimeWorkspacePath = RUNTIME_WORKSPACE_PATH;
  readonly workspaceAccess = 'host' as const;
  readonly capabilities: RuntimeCapabilities = getRuntimeCapabilities('host');

  private readonly terminals = new TerminalManager(() => 'host');
  private readonly workspaceManager?: Pick<WorkspaceManager, 'getRoots'>;
  private readonly ensureSeroCliBridge?: () => Promise<void>;
  private readonly substrate: HostRuntimeSubstrate;
  private readonly devServers: HostDevServerManager;

  constructor(options: HostBackendOptions) {
    this.workspaceId = options.workspaceId;
    this.hostWorkspacePath = options.hostWorkspacePath;
    this.workspaceManager = options.workspaceManager;
    this.ensureSeroCliBridge = options.ensureSeroCliBridge;
    this.substrate = options.substrate ?? createHostSubstrate(options.hostWorkspacePath);
    this.devServers = new HostDevServerManager({
      workspaceId: this.workspaceId,
      defaultCwd: this.runtimeWorkspacePath,
      spawn: (input) => this.spawn(input),
      processAdapter: createHostProcessAdapter({
        platform: this.substrate.platform,
        execFile: (input) => this.execFile(input),
      }),
    });
  }

  async health(): Promise<RuntimeHealth> {
    const bridgeStatus = await checkSeroCliBridgeReadiness(this.ensureSeroCliBridge);
    const checks = await runHostDoctorChecks({
      platform: this.substrate.platform,
      workspacePath: this.hostWorkspacePath,
      browser: await checkBrowserPackDoctor({ platform: this.substrate.platform }),
      processManagement: { state: 'ready' },
      seroCliBridge: bridgeStatus,
    });
    const blockingFailure = checks.find((check) => check.status === 'fail' && check.id !== 'runtime.host.browser');
    return {
      backend: this.backend,
      status: blockingFailure ? 'error' : 'ready',
      message: blockingFailure ? blockingFailure.message : 'Host runtime is ready.',
      checks,
    };
  }

  async ensure(): Promise<RuntimeSession> {
    return {
      backend: this.backend,
      workspaceId: this.workspaceId,
      hostWorkspacePath: this.hostWorkspacePath,
      runtimeWorkspacePath: this.runtimeWorkspacePath,
      state: 'running',
    };
  }

  async destroy(): Promise<void> {
    await this.devServers.dispose();
    this.terminals.disposeWorkspaceTerminals(this.workspaceId);
  }

  async exec(input: RuntimeExecInput): Promise<RuntimeExecResult> {
    const cwd = (await this.resolveHostPath(input.cwd ?? this.runtimeWorkspacePath)).hostPath;
    const rendered = await this.substrate.shellCommand({
      command: input.command,
      cwd,
      env: await createHostProcessEnv(this.workspaceId, input.env, this.substrate.platform),
    });
    try {
      const { stdout, stderr } = await trackedExecFile(this.workspaceId, cwd, rendered.program, rendered.args, {
        cwd: rendered.nativeCwd,
        env: rendered.env,
        timeout: input.timeoutMs ?? 120_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return {
        stdout: this.substrate.normalizeExecOutput(stdout),
        stderr: this.substrate.normalizeExecOutput(stderr),
        exitCode: 0,
      };
    } catch (err: unknown) {
      const execErr = err as { code?: number; stdout?: string; stderr?: string; message?: string; killed?: boolean };
      return {
        stdout: this.substrate.normalizeExecOutput(String(execErr.stdout ?? '')),
        stderr: this.substrate.normalizeExecOutput(execErr.killed
          ? `Command timed out after ${Math.round((input.timeoutMs ?? 120_000) / 1000)}s. ${String(execErr.stderr ?? '')}`.trim()
          : String(execErr.stderr ?? execErr.message ?? 'command failed')),
        exitCode: execErr.killed ? 124 : (typeof execErr.code === 'number' ? execErr.code : 1),
      };
    }
  }

  async execFile(input: RuntimeExecFileInput): Promise<RuntimeExecResult> {
    const cwd = (await this.resolveHostPath(input.cwd ?? this.runtimeWorkspacePath)).hostPath;
    const rendered = await this.substrate.execFileCommand({
      program: input.program,
      args: input.args,
      cwd,
      env: await createHostProcessEnv(this.workspaceId, input.env, this.substrate.platform),
    });
    try {
      const { stdout, stderr } = await trackedExecFile(this.workspaceId, cwd, rendered.program, rendered.args, {
        cwd: rendered.nativeCwd,
        env: rendered.env,
        timeout: input.timeoutMs ?? 120_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return {
        stdout: this.substrate.normalizeExecOutput(stdout),
        stderr: this.substrate.normalizeExecOutput(stderr),
        exitCode: 0,
      };
    } catch (err: unknown) {
      const execErr = err as { code?: number; stdout?: string; stderr?: string; message?: string; killed?: boolean };
      return {
        stdout: this.substrate.normalizeExecOutput(String(execErr.stdout ?? '')),
        stderr: this.substrate.normalizeExecOutput(execErr.killed
          ? `Command timed out after ${Math.round((input.timeoutMs ?? 120_000) / 1000)}s. ${String(execErr.stderr ?? '')}`.trim()
          : String(execErr.stderr ?? execErr.message ?? 'command failed')),
        exitCode: execErr.killed ? 124 : (typeof execErr.code === 'number' ? execErr.code : 1),
      };
    }
  }

  isSshAvailable(): Promise<boolean> {
    return this.substrate.isSshAvailable();
  }

  async spawn(input: RuntimeProcessInput): Promise<RuntimeProcess> {
    const cwd = (await this.resolveHostPath(input.cwd ?? this.runtimeWorkspacePath)).hostPath;
    const rendered = await this.substrate.shellCommand({
      command: input.command,
      cwd,
      env: await createHostProcessEnv(this.workspaceId, input.env, this.substrate.platform),
    });
    const child = spawnProcess(rendered.program, rendered.args, {
      cwd: rendered.nativeCwd,
      env: rendered.env,
      stdio: input.stdio === 'inherit' ? 'inherit' : 'pipe',
    });
    const dataCallbacks = new Set<(chunk: string) => void>();
    const exitCallbacks = new Set<(exit: { exitCode: number | null; signal?: string }) => void>();

    child.stdout?.on('data', (chunk: Buffer) => emitData(dataCallbacks, chunk));
    child.stderr?.on('data', (chunk: Buffer) => emitData(dataCallbacks, chunk));
    let exited = false;
    let unregister: () => void = () => undefined;
    const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
    child.on('exit', (exitCode, signal) => {
      exited = true;
      unregister();
      for (const cb of exitCallbacks) cb({ exitCode, signal: signal ?? undefined });
    });

    unregister = seroOwnedProcesses.register({
      id: `${input.ownerKind ?? 'command'}:${this.workspaceId}:${child.pid ?? 'pending'}`,
      kind: input.ownerKind ?? 'command',
      cwd,
      stop: async () => {
        if (!exited) await this.substrate.signalChild(child, rendered, 'SIGTERM');
        await closed;
      },
    });

    const executionPid = await this.substrate.resolveExecutionPid?.(child, rendered);

    return {
      pid: child.pid,
      executionPid,
      write: (chunk) => { child.stdin?.write(chunk); },
      signal: (signal) => { void this.substrate.signalChild(child, rendered, signal ?? 'SIGTERM'); },
      onData: (cb) => subscribe(dataCallbacks, cb),
      onExit: (cb) => subscribe(exitCallbacks, cb),
    };
  }

  async readFile(input: RuntimeReadFileInput): Promise<RuntimeFileReadResult> {
    const content = await this.substrate.readFile((await this.resolveHostPath(input.path)).hostPath);
    if (input.binary) return { content: content.toString('base64'), encoding: 'base64' };
    const encoding = input.encoding ?? 'utf8';
    return { content: content.toString(encoding), encoding };
  }

  async writeFile(input: RuntimeWriteFileInput): Promise<void> {
    await this.substrate.writeFile(
      (await this.resolveHostPath(input.path)).hostPath,
      Buffer.from(input.content, input.encoding ?? 'utf8'),
    );
  }

  async listFiles(input: RuntimeListFilesInput): Promise<RuntimeDirectoryEntry[]> {
    const resolution = await this.resolveHostPath(input.path);
    const entries: RuntimeDirectoryEntry[] = [];
    await this.collectEntries(
      resolution.rootHostPath,
      resolution.hostPath,
      input.recursive === true,
      input.limit ?? 1000,
      entries,
      resolution.returnHostPaths,
    );
    return entries;
  }

  async rename(input: RuntimeRenameInput): Promise<void> {
    await this.substrate.rename((await this.resolveHostPath(input.oldPath)).hostPath, (await this.resolveHostPath(input.newPath)).hostPath);
  }

  async delete(input: RuntimeDeleteInput): Promise<void> {
    await this.substrate.delete((await this.resolveHostPath(input.path)).hostPath, { recursive: input.recursive === true });
  }

  async createFile(input: RuntimeCreateFileInput): Promise<void> {
    const filePath = (await this.resolveHostPath(input.path)).hostPath;
    if (input.overwrite === false && await this.substratePathExists(filePath)) {
      throw new Error(`File already exists: ${input.path}`);
    }
    await this.substrate.writeFile(filePath, Buffer.from(input.content, input.encoding ?? 'utf8'));
  }

  async createDirectory(input: RuntimeCreateDirectoryInput): Promise<void> {
    await this.substrate.createDirectory((await this.resolveHostPath(input.path)).hostPath, { recursive: input.recursive === true });
  }

  async watchFiles(input: RuntimeFileWatchInput): Promise<RuntimeFileWatch> {
    const watchers = await Promise.all(input.paths.map(async (runtimePath) => (
      this.substrate.watchFiles((await this.resolveHostPath(runtimePath)).hostPath, () => undefined)
    )));
    return { close: async () => { await Promise.all(watchers.map((fileWatcher) => fileWatcher.close())); } };
  }

  async createTerminal(input: RuntimeTerminalInput): Promise<RuntimeTerminalSession> {
    const cwd = (await this.resolveHostPath(input.cwd ?? this.runtimeWorkspacePath)).hostPath;
    const terminal = this.terminals.createHostTerminal(
      this.workspaceId,
      input.terminalId,
      await this.substrate.terminalCommand({
        cwd,
        env: await createHostProcessEnv(this.workspaceId, undefined, this.substrate.platform, { tokenMode: 'reusable' }),
      }),
      input.cols,
      input.rows,
    );
    let exited = false;
    let unregister: () => void = () => undefined;
    const exitedPromise = new Promise<void>((resolve) => terminal.onExit(() => {
      exited = true;
      unregister();
      resolve();
    }));
    unregister = seroOwnedProcesses.register({
      id: `terminal:${this.workspaceId}:${input.terminalId}`,
      kind: 'terminal',
      cwd,
      async stop() {
        if (!exited) terminal.kill();
        await exitedPromise;
      },
    });
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
      replayBuffer: () => this.terminals.getReplayBuffer(input.terminalId),
    };
  }

  async startDevServer(input: RuntimeDevServerStartInput): Promise<RuntimeDevServer> {
    return this.devServers.start(input);
  }

  async registerDevServer(input: RuntimeDevServerRegisterInput): Promise<RuntimeDevServer> {
    return this.devServers.register(input);
  }

  async stopDevServer(input: RuntimeDevServerStopInput): Promise<void> {
    await this.devServers.stop(input);
  }

  async unregisterDevServer(input: RuntimeDevServerStopInput): Promise<void> {
    this.devServers.unregister(input);
  }

  async restartDevServer(input: RuntimeDevServerRestartInput): Promise<RuntimeDevServer> {
    return this.devServers.restart(input);
  }

  async getDevServerStatus(input: RuntimeDevServerStatusInput): Promise<RuntimeDevServerStatus> {
    return this.devServers.status(input);
  }

  listDevServersSync(): RuntimeDevServer[] {
    return this.devServers.list();
  }

  onDevServerChange(cb: (event: RuntimeDevServerChangeEvent) => void): () => void {
    return this.devServers.onChange(cb);
  }

  async forwardPort(_input: RuntimeForwardPortInput): Promise<RuntimeForwardedPort> {
    throw unsupported('Host runtime does not support runtime port forwarding.');
  }

  async stopForward(_input: RuntimeStopForwardInput): Promise<void> {
    throw unsupported('Host runtime does not support runtime port forwarding.');
  }

  async resolvePreviewUrl(input: RuntimePreviewUrlInput): Promise<RuntimePreviewUrl> {
    return this.devServers.resolvePreviewUrl(input);
  }

  private async resolveHostPath(runtimePath: string): Promise<HostPathResolution> {
    if (isHostAbsolutePath(runtimePath) && !(runtimePath.startsWith('/') && isRuntimeWorkspacePath(runtimePath))) {
      const resolution = await this.findAllowedHostRoot(runtimePath);
      if (!resolution) {
        throw new Error(`Host path must be inside a workspace root: ${runtimePath}`);
      }
      return { ...resolution, returnHostPaths: true };
    }

    const hostPath = toHostWorkspacePath(this.hostWorkspacePath, runtimePath);
    const [canonicalPath, canonicalRoot] = await Promise.all([
      this.resolvePathInsideRoot(hostPath, this.hostWorkspacePath, runtimePath),
      this.resolvePathInsideRoot(this.hostWorkspacePath, this.hostWorkspacePath, runtimePath),
    ]);
    return {
      hostPath: canonicalPath,
      rootHostPath: canonicalRoot,
      returnHostPaths: false,
    };
  }

  private async findAllowedHostRoot(hostPath: string): Promise<Omit<HostPathResolution, 'returnHostPaths'> | null> {
    const roots = [
      this.hostWorkspacePath,
      ...await this.additionalRootPaths(),
      ...this.agentRootPaths(),
    ];
    const matches = await Promise.all(roots.map(async (root) => ({
      root,
      canonicalPath: await this.substrate.resolvePathInsideRoot(hostPath, root),
    })));
    const match = matches.find((candidate) => candidate.canonicalPath);
    if (!match?.canonicalPath) return null;
    return {
      hostPath: match.canonicalPath,
      rootHostPath: await this.resolvePathInsideRoot(match.root, match.root, hostPath),
    };
  }

  private async resolvePathInsideRoot(hostPath: string, root: string, originalPath: string): Promise<string> {
    const canonicalPath = await this.substrate.resolvePathInsideRoot(hostPath, root);
    if (!canonicalPath) {
      throw new Error(`Host path must be inside a workspace root: ${originalPath}`);
    }
    return canonicalPath;
  }

  private async additionalRootPaths(): Promise<string[]> {
    if (!this.workspaceManager) return [];
    return (await this.workspaceManager.getRoots(this.workspaceId)).map((root) => root.path);
  }

  private agentRootPaths(): string[] {
    const agentRoot = getSeroAgentRootPath();
    return agentRoot ? [agentRoot] : [];
  }

  private async collectEntries(
    rootHostPath: string,
    directoryPath: string,
    recursive: boolean,
    limit: number,
    entries: RuntimeDirectoryEntry[],
    returnHostPaths: boolean,
  ): Promise<void> {
    if (entries.length >= limit) return;
    const dirents = await this.substrate.listFiles(directoryPath);
    const candidates = await Promise.all(dirents.map(async (dirent) => {
      if (entries.length >= limit) return;
      const hostPath = path.join(directoryPath, dirent.name);
      const runtimePath = returnHostPaths ? hostPath : toRuntimeWorkspacePath(rootHostPath, hostPath);
      if (!runtimePath) return null;
      const canonicalChildPath = await this.substrate.resolvePathInsideRoot(hostPath, rootHostPath);
      if (!canonicalChildPath) return null;
      const type: RuntimeDirectoryEntry['type'] = dirent.type === 'directory' ? 'directory' : 'file';
      const fileStat = await this.substrate.stat(canonicalChildPath);
      return {
        entry: { name: dirent.name, path: runtimePath, type, size: fileStat.size },
        hostPath,
        shouldRecurse: recursive && dirent.type === 'directory',
      };
    }));

    await candidates.reduce<Promise<void>>((previous, candidate) => previous.then(() => {
      if (!candidate || entries.length >= limit) return;
      entries.push(candidate.entry);
      if (candidate.shouldRecurse) {
        return this.collectEntries(rootHostPath, candidate.hostPath, recursive, limit, entries, returnHostPaths);
      }
    }), Promise.resolve());
  }

  private async substratePathExists(filePath: string): Promise<boolean> {
    try {
      await this.substrate.stat(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

function emitData(callbacks: Set<(chunk: string) => void>, chunk: Buffer): void {
  const text = chunk.toString();
  for (const cb of callbacks) cb(text);
}

function subscribe<T>(callbacks: Set<(value: T) => void>, cb: (value: T) => void): () => void {
  callbacks.add(cb);
  return () => callbacks.delete(cb);
}

async function checkSeroCliBridgeReadiness(
  ensureBridge: (() => Promise<void>) | undefined,
): Promise<{ state: 'ready' | 'failed'; message?: string }> {
  try {
    if (!ensureBridge) throw new Error('Sero CLI bridge starter is not configured.');
    await ensureBridge();
    return { state: 'ready' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { state: 'failed', message: `Sero CLI bridge is not available for host commands: ${message}` };
  }
}

function unsupported(message: string): Error {
  return new Error(message);
}

function isHostAbsolutePath(inputPath: string): boolean {
  return path.isAbsolute(inputPath);
}
