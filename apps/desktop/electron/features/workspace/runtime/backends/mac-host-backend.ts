import { execFile, spawn as spawnProcess } from 'child_process';
import { watch } from 'fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

import { TerminalManager } from '@electron/features/container/terminal';
import { getRuntimeCapabilities } from '../capabilities';
import { RUNTIME_WORKSPACE_PATH, toHostWorkspacePath, toRuntimeWorkspacePath } from '../runtime-paths';
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

const execFileAsync = promisify(execFile);

interface MacHostBackendOptions {
  workspaceId: string;
  hostWorkspacePath: string;
}

export class MacHostBackend implements RuntimeBackend {
  readonly backend = 'mac-host' as const;
  readonly workspaceId: string;
  readonly hostWorkspacePath: string;
  readonly runtimeWorkspacePath = RUNTIME_WORKSPACE_PATH;
  readonly workspaceAccess = 'host' as const;
  readonly capabilities: RuntimeCapabilities = getRuntimeCapabilities('mac-host');

  private readonly terminals = new TerminalManager(() => 'host');

  constructor(options: MacHostBackendOptions) {
    this.workspaceId = options.workspaceId;
    this.hostWorkspacePath = options.hostWorkspacePath;
  }

  async health(): Promise<RuntimeHealth> {
    return { backend: this.backend, status: 'ready', message: 'Mac Host runtime is ready.' };
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
    this.terminals.disposeWorkspaceTerminals(this.workspaceId);
  }

  async exec(input: RuntimeExecInput): Promise<RuntimeExecResult> {
    const cwd = this.resolvePath(input.cwd ?? this.runtimeWorkspacePath);
    try {
      const { stdout, stderr } = await execFileAsync('sh', ['-c', input.command], {
        cwd,
        env: { ...process.env, ...input.env },
        timeout: input.timeoutMs ?? 120_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { stdout, stderr, exitCode: 0 };
    } catch (err: unknown) {
      const execErr = err as { code?: number; stdout?: string; stderr?: string; message?: string; killed?: boolean };
      return {
        stdout: String(execErr.stdout ?? ''),
        stderr: execErr.killed
          ? `Command timed out after ${Math.round((input.timeoutMs ?? 120_000) / 1000)}s. ${String(execErr.stderr ?? '')}`.trim()
          : String(execErr.stderr ?? execErr.message ?? 'command failed'),
        exitCode: execErr.killed ? 124 : (typeof execErr.code === 'number' ? execErr.code : 1),
      };
    }
  }

  async spawn(input: RuntimeProcessInput): Promise<RuntimeProcess> {
    const child = spawnProcess('sh', ['-c', input.command], {
      cwd: this.resolvePath(input.cwd ?? this.runtimeWorkspacePath),
      env: { ...process.env, ...input.env },
      stdio: input.stdio === 'inherit' ? 'inherit' : 'pipe',
    });
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
    const content = await readFile(this.resolvePath(input.path));
    if (input.binary) return { content: content.toString('base64'), encoding: 'base64' };
    const encoding = input.encoding ?? 'utf8';
    return { content: content.toString(encoding), encoding };
  }

  async writeFile(input: RuntimeWriteFileInput): Promise<void> {
    const filePath = this.resolvePath(input.path);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, input.content, { encoding: input.encoding ?? 'utf8', mode: input.mode });
  }

  async listFiles(input: RuntimeListFilesInput): Promise<RuntimeDirectoryEntry[]> {
    const rootPath = this.resolvePath(input.path);
    const entries: RuntimeDirectoryEntry[] = [];
    await this.collectEntries(rootPath, input.recursive === true, input.limit ?? 1000, entries);
    return entries;
  }

  async rename(input: RuntimeRenameInput): Promise<void> {
    await rename(this.resolvePath(input.oldPath), this.resolvePath(input.newPath));
  }

  async delete(input: RuntimeDeleteInput): Promise<void> {
    await rm(this.resolvePath(input.path), { recursive: input.recursive === true, force: true });
  }

  async createFile(input: RuntimeCreateFileInput): Promise<void> {
    const filePath = this.resolvePath(input.path);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, input.content, {
      encoding: input.encoding ?? 'utf8',
      mode: input.mode,
      flag: input.overwrite === false ? 'wx' : 'w',
    });
  }

  async createDirectory(input: RuntimeCreateDirectoryInput): Promise<void> {
    await mkdir(this.resolvePath(input.path), { recursive: input.recursive === true });
  }

  async watchFiles(input: RuntimeFileWatchInput): Promise<RuntimeFileWatch> {
    const watchers = input.paths.map((runtimePath) => watch(this.resolvePath(runtimePath), { recursive: false }));
    return { close: async () => { await Promise.all(watchers.map((fileWatcher) => fileWatcher.close())); } };
  }

  async createTerminal(input: RuntimeTerminalInput): Promise<RuntimeTerminalSession> {
    const terminal = this.terminals.createHostTerminal(
      this.workspaceId,
      input.terminalId,
      this.resolvePath(input.cwd ?? this.runtimeWorkspacePath),
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

  async startDevServer(_input: RuntimeDevServerStartInput): Promise<RuntimeDevServer> {
    throw unsupported('Mac Host runtime does not support managed dev servers yet.');
  }

  async stopDevServer(_input: RuntimeDevServerStopInput): Promise<void> {
    throw unsupported('Mac Host runtime does not support managed dev servers yet.');
  }

  async restartDevServer(_input: RuntimeDevServerRestartInput): Promise<RuntimeDevServer> {
    throw unsupported('Mac Host runtime does not support managed dev servers yet.');
  }

  async getDevServerStatus(_input: RuntimeDevServerStatusInput): Promise<RuntimeDevServerStatus> {
    return { servers: [] };
  }

  async forwardPort(_input: RuntimeForwardPortInput): Promise<RuntimeForwardedPort> {
    throw unsupported('Mac Host runtime does not support runtime port forwarding.');
  }

  async stopForward(_input: RuntimeStopForwardInput): Promise<void> {
    throw unsupported('Mac Host runtime does not support runtime port forwarding.');
  }

  async resolvePreviewUrl(_input: RuntimePreviewUrlInput): Promise<RuntimePreviewUrl> {
    throw unsupported('Mac Host runtime does not support runtime preview URLs.');
  }

  private resolvePath(runtimePath: string): string {
    return toHostWorkspacePath(this.hostWorkspacePath, runtimePath);
  }

  private async collectEntries(
    directoryPath: string,
    recursive: boolean,
    limit: number,
    entries: RuntimeDirectoryEntry[],
  ): Promise<void> {
    if (entries.length >= limit) return;
    const dirents = await readdir(directoryPath, { withFileTypes: true });
    for (const dirent of dirents) {
      if (entries.length >= limit) return;
      const hostPath = path.join(directoryPath, dirent.name);
      const runtimePath = toRuntimeWorkspacePath(this.hostWorkspacePath, hostPath);
      if (!runtimePath) continue;
      const type = dirent.isDirectory() ? 'directory' : 'file';
      const fileStat = await stat(hostPath);
      entries.push({ name: dirent.name, path: runtimePath, type, size: fileStat.size });
      if (recursive && dirent.isDirectory()) {
        await this.collectEntries(hostPath, recursive, limit, entries);
      }
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
