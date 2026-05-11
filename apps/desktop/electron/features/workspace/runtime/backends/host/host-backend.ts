import { execFile, spawn as spawnProcess } from 'child_process';
import path from 'path';
import { promisify } from 'util';

import { TerminalManager } from '@electron/features/container/terminal';
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
import { HostDevServerManager } from './host-dev-server-manager';
import { assertSameWslDistroForAdditionalRoots, isWindowsDrivePath, isWslUncPath } from './wsl-paths';

const execFileAsync = promisify(execFile);

export interface HostBackendOptions {
  workspaceId: string;
  hostWorkspacePath: string;
  workspaceManager?: Pick<WorkspaceManager, 'getRoots'>;
  substrate?: HostRuntimeSubstrate;
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
  private readonly substrate: HostRuntimeSubstrate;
  private readonly devServers: HostDevServerManager;

  constructor(options: HostBackendOptions) {
    this.workspaceId = options.workspaceId;
    this.hostWorkspacePath = options.hostWorkspacePath;
    this.workspaceManager = options.workspaceManager;
    this.substrate = options.substrate ?? createHostSubstrate(options.hostWorkspacePath);
    this.devServers = new HostDevServerManager({
      workspaceId: this.workspaceId,
      platform: this.substrate.platform,
      spawn: (input) => this.spawn(input),
      execFile: (input) => this.execFile(input),
    });
  }

  async health(): Promise<RuntimeHealth> {
    return { backend: this.backend, status: 'ready', message: 'Host runtime is ready.' };
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
    this.devServers.dispose();
    this.terminals.disposeWorkspaceTerminals(this.workspaceId);
  }

  async exec(input: RuntimeExecInput): Promise<RuntimeExecResult> {
    const cwd = (await this.resolveHostPath(input.cwd ?? this.runtimeWorkspacePath)).hostPath;
    const rendered = this.substrate.shellCommand({
      command: input.command,
      cwd,
      env: createProcessEnv(input.env),
    });
    try {
      const { stdout, stderr } = await execFileAsync(rendered.program, rendered.args, {
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
    const rendered = this.substrate.execFileCommand({
      program: input.program,
      args: input.args,
      cwd,
      env: createProcessEnv(input.env),
    });
    try {
      const { stdout, stderr } = await execFileAsync(rendered.program, rendered.args, {
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
    const rendered = this.substrate.shellCommand({
      command: input.command,
      cwd: (await this.resolveHostPath(input.cwd ?? this.runtimeWorkspacePath)).hostPath,
      env: createProcessEnv(input.env),
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
    child.on('exit', (exitCode, signal) => {
      for (const cb of exitCallbacks) cb({ exitCode, signal: signal ?? undefined });
    });

    const executionPid = await this.substrate.resolveExecutionPid?.(child, rendered);

    return {
      pid: child.pid,
      executionPid,
      write: (chunk) => { child.stdin?.write(chunk); },
      signal: (signal) => { void this.substrate.signalChild(child, rendered, signal); },
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
    const terminal = this.terminals.createHostTerminal(
      this.workspaceId,
      input.terminalId,
      this.substrate.terminalCommand({
        cwd: (await this.resolveHostPath(input.cwd ?? this.runtimeWorkspacePath)).hostPath,
        env: createProcessEnv(),
      }),
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
      replayBuffer: () => this.terminals.getReplayBuffer(input.terminalId),
    };
  }

  async startDevServer(input: RuntimeDevServerStartInput): Promise<RuntimeDevServer> {
    return this.devServers.start(input);
  }

  async stopDevServer(input: RuntimeDevServerStopInput): Promise<void> {
    await this.devServers.stop(input);
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
      const matchedRoot = await this.findAllowedHostRoot(runtimePath);
      if (!matchedRoot) {
        throw new Error(`Host path must be inside a workspace root: ${runtimePath}`);
      }
      return { hostPath: runtimePath, rootHostPath: matchedRoot, returnHostPaths: true };
    }

    return {
      hostPath: toHostWorkspacePath(this.hostWorkspacePath, runtimePath),
      rootHostPath: this.hostWorkspacePath,
      returnHostPaths: false,
    };
  }

  private async findAllowedHostRoot(hostPath: string): Promise<string | null> {
    const roots = [this.hostWorkspacePath, ...await this.additionalRootPaths()];
    return roots.find((root) => this.substrate.isPathInsideRoot(hostPath, root)) ?? null;
  }

  private async additionalRootPaths(): Promise<string[]> {
    if (!this.workspaceManager) return [];
    const roots = (await this.workspaceManager.getRoots(this.workspaceId)).map((root) => root.path);
    assertSameWslDistroForAdditionalRoots(this.hostWorkspacePath, roots);
    return roots;
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
    for (const dirent of dirents) {
      if (entries.length >= limit) return;
      const hostPath = path.join(directoryPath, dirent.name);
      const runtimePath = returnHostPaths ? hostPath : toRuntimeWorkspacePath(rootHostPath, hostPath);
      if (!runtimePath) continue;
      const type = dirent.type === 'directory' ? 'directory' : 'file';
      const fileStat = await this.substrate.stat(hostPath);
      entries.push({ name: dirent.name, path: runtimePath, type, size: fileStat.size });
      if (recursive && dirent.type === 'directory') {
        await this.collectEntries(rootHostPath, hostPath, recursive, limit, entries, returnHostPaths);
      }
    }
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

function unsupported(message: string): Error {
  return new Error(message);
}

function isHostAbsolutePath(inputPath: string): boolean {
  return path.isAbsolute(inputPath) || isWindowsDrivePath(inputPath) || isWslUncPath(inputPath);
}

function createProcessEnv(overrides?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  return { ...env, ...overrides };
}
