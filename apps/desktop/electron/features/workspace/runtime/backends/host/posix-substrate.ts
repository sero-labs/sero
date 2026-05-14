import type { ChildProcess } from 'child_process';
import { execFile } from 'child_process';
import { existsSync, watch } from 'fs';
import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

import { RUNTIME_WORKSPACE_PATH } from '../../runtime-paths';
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

export class PosixHostSubstrate implements HostRuntimeSubstrate {
  readonly platform: NodeJS.Platform;
  readonly kind = 'posix' as const;
  readonly runtimeWorkspacePath = RUNTIME_WORKSPACE_PATH;

  constructor(options: { platform?: NodeJS.Platform } = {}) {
    this.platform = options.platform ?? process.platform;
  }

  toExecutionPath(nativePath: string): string {
    return path.resolve(nativePath);
  }

  toNativeHostPath(executionPath: string): string {
    return path.resolve(executionPath);
  }

  isPathInsideRoot(nativePath: string, root: string): boolean {
    const relative = path.relative(this.toExecutionPath(root), this.toExecutionPath(nativePath));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  async resolvePathInsideRoot(nativePath: string, root: string): Promise<string | null> {
    const canonicalRoot = await realpath(this.toNativeHostPath(root));
    const resolvedCandidate = path.resolve(this.toNativeHostPath(nativePath));
    const { existingAncestor, missingSegments } = findExistingAncestor(resolvedCandidate);
    const canonicalAncestor = await realpath(existingAncestor);
    const canonicalCandidate = path.join(canonicalAncestor, ...missingSegments);
    return isPathInside(canonicalCandidate, canonicalRoot) ? canonicalCandidate : null;
  }

  shellCommand(opts: HostSubstrateSpawnOptions): HostSubstrateRendered {
    return {
      program: 'bash',
      args: opts.loginShell === true ? ['--login', '-c', opts.command] : ['-c', opts.command],
      nativeCwd: this.toNativeHostPath(opts.cwd),
      env: opts.env,
    };
  }

  execFileCommand(opts: HostSubstrateExecFileOptions): HostSubstrateRendered {
    return {
      program: opts.program,
      args: opts.args,
      nativeCwd: this.toNativeHostPath(opts.cwd),
      env: opts.env,
    };
  }

  terminalCommand(opts: { cwd: string; env?: Record<string, string> }): HostSubstrateRendered {
    return {
      program: process.env.SHELL ?? '/bin/zsh',
      args: ['--login'],
      nativeCwd: this.toNativeHostPath(opts.cwd),
      env: opts.env,
    };
  }

  readFile(filePath: string): Promise<Buffer> {
    return readFile(this.toNativeHostPath(filePath));
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    const nativePath = this.toNativeHostPath(filePath);
    await mkdir(path.dirname(nativePath), { recursive: true });
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
        path: filename ? path.join(filePath, filename.toString()) : filePath,
      });
    });
    return { close: async () => { fileWatcher.close(); } };
  }

  async isSshAvailable(): Promise<boolean> {
    try {
      const result = await execFileAsync('ssh', [
        '-T',
        '-o',
        'StrictHostKeyChecking=accept-new',
        '-o',
        'ConnectTimeout=5',
        'git@github.com',
      ], { timeout: 10_000 }).catch((error: unknown) => normalizeSshProbeFailure(error));
      return result.stderr.includes('successfully authenticated');
    } catch {
      return false;
    }
  }

  async resolveExecutionPid(child: ChildProcess): Promise<number | undefined> {
    return child.pid;
  }

  async signalChild(child: ChildProcess, _rendered: HostSubstrateRendered, signal: NodeJS.Signals | number): Promise<void> {
    child.kill(signal);
  }

  normalizeExecOutput(output: string): string {
    return output;
  }
}

function findExistingAncestor(candidate: string): { existingAncestor: string; missingSegments: string[] } {
  const missingSegments: string[] = [];
  let current = candidate;
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    missingSegments.unshift(path.basename(current));
    current = parent;
  }
  return { existingAncestor: current, missingSegments };
}

function isPathInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
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

export function createPosixHostSubstrate(options: { platform?: NodeJS.Platform } = {}): PosixHostSubstrate {
  return new PosixHostSubstrate(options);
}
