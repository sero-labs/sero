import type { ChildProcess } from 'child_process';
import { execFile } from 'child_process';
import { existsSync, watch } from 'fs';
import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

import { RUNTIME_WORKSPACE_PATH } from '../../runtime-paths';
import { HostToolResolver, type HostToolResolverLike } from '../../toolchains/host-tool-resolver';
import type { ToolInstallReason } from '../../toolchains/types';
import type {
  HostRuntimeSubstrate,
  HostSubstrateExecFileOptions,
  HostSubstrateFileEntry,
  HostSubstrateFileWatch,
  HostSubstrateFileWatchEvent,
  HostSubstrateRendered,
  HostSubstrateSpawnOptions,
  HostSubstrateStat,
} from './host-substrate';

const execFileAsync = promisify(execFile);
const winPath = path.win32;

export class WindowsHostSubstrate implements HostRuntimeSubstrate {
  readonly platform = 'win32' as const;
  readonly kind = 'windows' as const;
  readonly runtimeWorkspacePath = RUNTIME_WORKSPACE_PATH;

  private readonly tools: HostToolResolverLike;

  constructor(options: { tools?: HostToolResolverLike } = {}) {
    this.tools = options.tools ?? new HostToolResolver({ platform: this.platform });
  }

  toExecutionPath(nativePath: string): string {
    return winPath.resolve(nativePath);
  }

  toNativeHostPath(executionPath: string): string {
    return winPath.resolve(executionPath);
  }

  isPathInsideRoot(nativePath: string, root: string): boolean {
    return isWinPathInside(this.toExecutionPath(nativePath), this.toExecutionPath(root));
  }

  async resolvePathInsideRoot(nativePath: string, root: string): Promise<string | null> {
    if (process.platform !== 'win32') {
      const candidate = this.toNativeHostPath(nativePath);
      const normalizedRoot = this.toNativeHostPath(root);
      return isWinPathInside(candidate, normalizedRoot) ? candidate : null;
    }

    const canonicalRoot = await realpath(this.toNativeHostPath(root));
    const resolvedCandidate = this.toNativeHostPath(nativePath);
    const { existingAncestor, missingSegments } = findExistingAncestor(resolvedCandidate);
    const canonicalAncestor = await realpath(existingAncestor);
    const canonicalCandidate = winPath.join(canonicalAncestor, ...missingSegments);
    return isWinPathInside(canonicalCandidate, canonicalRoot) ? canonicalCandidate : null;
  }

  async shellCommand(opts: HostSubstrateSpawnOptions): Promise<HostSubstrateRendered> {
    const nativeCwd = this.toNativeHostPath(opts.cwd);
    const shell = await this.tools.prepareShell(makeReason('workspace-shell', nativeCwd, opts.command));
    return {
      program: shell.path,
      args: opts.loginShell === true ? ['--login', '-c', opts.command] : ['-c', opts.command],
      nativeCwd,
      env: await this.tools.prepareEnv(opts.env),
    };
  }

  async execFileCommand(opts: HostSubstrateExecFileOptions): Promise<HostSubstrateRendered> {
    const nativeCwd = this.toNativeHostPath(opts.cwd);
    return {
      program: await this.tools.prepareProgram(opts.program, makeReason('workspace-command', nativeCwd, opts.program)),
      args: opts.args,
      nativeCwd,
      env: await this.tools.prepareEnv(opts.env),
    };
  }

  async terminalCommand(opts: { cwd: string; env?: Record<string, string> }): Promise<HostSubstrateRendered> {
    const nativeCwd = this.toNativeHostPath(opts.cwd);
    const env = await this.tools.prepareEnv(opts.env);
    return {
      program: await this.tools.resolveTerminalShell(undefined, makeReason('workspace-terminal', nativeCwd)),
      args: ['--login'],
      nativeCwd,
      env,
    };
  }

  readFile(filePath: string): Promise<Buffer> {
    return readFile(this.toNativeHostPath(filePath));
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    const nativePath = this.toNativeHostPath(filePath);
    await mkdir(winPath.dirname(nativePath), { recursive: true });
    await writeFile(nativePath, data);
  }

  async listFiles(directoryPath: string): Promise<HostSubstrateFileEntry[]> {
    const dirents = await readdir(this.toNativeHostPath(directoryPath), { withFileTypes: true });
    return dirents.map((dirent) => ({
      name: dirent.name,
      type: dirent.isSymbolicLink() ? 'symlink' : (dirent.isDirectory() ? 'directory' : 'file'),
    }));
  }

  async stat(filePath: string): Promise<HostSubstrateStat> {
    const fileStat = await stat(this.toNativeHostPath(filePath));
    return {
      size: fileStat.size,
      mtimeMs: fileStat.mtimeMs,
      type: fileStat.isSymbolicLink() ? 'symlink' : (fileStat.isDirectory() ? 'directory' : 'file'),
    };
  }

  rename(from: string, to: string): Promise<void> {
    return rename(this.toNativeHostPath(from), this.toNativeHostPath(to));
  }

  delete(filePath: string, opts: { recursive?: boolean } = {}): Promise<void> {
    return rm(this.toNativeHostPath(filePath), { recursive: opts.recursive === true, force: true });
  }

  async createDirectory(directoryPath: string, opts: { recursive?: boolean } = {}): Promise<void> {
    await mkdir(this.toNativeHostPath(directoryPath), { recursive: opts.recursive === true });
  }

  async watchFiles(
    filePath: string,
    onEvent: (event: HostSubstrateFileWatchEvent) => void,
  ): Promise<HostSubstrateFileWatch> {
    const fileWatcher = watch(this.toNativeHostPath(filePath), { recursive: false }, (eventType, filename) => {
      onEvent({
        kind: eventType === 'rename' ? 'move' : 'modify',
        path: filename ? winPath.join(filePath, filename.toString()) : filePath,
      });
    });
    return { close: async () => { fileWatcher.close(); } };
  }

  async isSshAvailable(): Promise<boolean> {
    try {
      const result = await execFileAsync('ssh', ['-T', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=5', 'git@github.com'], {
        timeout: 10_000,
      }).catch((error: unknown) => normalizeSshProbeFailure(error));
      return result.stderr.includes('successfully authenticated');
    } catch {
      return false;
    }
  }

  async resolveExecutionPid(child: ChildProcess): Promise<number | undefined> {
    return child.pid;
  }

  async signalChild(child: ChildProcess, _rendered: HostSubstrateRendered, signal: NodeJS.Signals | number): Promise<void> {
    if (!child.pid) return;
    const args = ['/PID', String(child.pid), '/T'];
    if (isForceSignal(signal)) args.push('/F');
    await execFileAsync(windowsSystemToolPath('taskkill.exe'), args).catch(() => undefined);
  }

  normalizeExecOutput(output: string): string {
    return output.replace(/\r\n/g, '\n');
  }
}

function windowsSystemToolPath(executable: string): string {
  return winPath.join(process.env.SystemRoot || 'C:\\Windows', 'System32', executable);
}

function findExistingAncestor(candidate: string): { existingAncestor: string; missingSegments: string[] } {
  const missingSegments: string[] = [];
  let current = candidate;
  while (!existsSync(current)) {
    const parent = winPath.dirname(current);
    if (parent === current) break;
    missingSegments.unshift(winPath.basename(current));
    current = parent;
  }
  return { existingAncestor: current, missingSegments };
}

function isWinPathInside(candidate: string, root: string): boolean {
  const relative = winPath.relative(winPath.normalize(root), winPath.normalize(candidate));
  return relative === '' || (!relative.startsWith('..') && !winPath.isAbsolute(relative));
}

function isForceSignal(signal: NodeJS.Signals | number): boolean {
  return String(signal).toUpperCase() === 'SIGKILL' || String(signal).toUpperCase() === 'KILL';
}

function makeReason(
  kind: ToolInstallReason['kind'],
  workspacePath: string,
  command?: string,
): ToolInstallReason {
  return { kind, workspacePath, command };
}

function normalizeSshProbeFailure(error: unknown): { stdout: string; stderr: string } {
  if (typeof error !== 'object' || error === null) return { stdout: '', stderr: '' };
  const failure = error as { stdout?: unknown; stderr?: unknown; message?: unknown };
  return {
    stdout: typeof failure.stdout === 'string' ? failure.stdout : '',
    stderr: typeof failure.stderr === 'string'
      ? failure.stderr
      : typeof failure.message === 'string'
        ? failure.message
        : '',
  };
}

export function createWindowsHostSubstrate(options: { tools?: HostToolResolverLike } = {}): WindowsHostSubstrate {
  return new WindowsHostSubstrate(options);
}
