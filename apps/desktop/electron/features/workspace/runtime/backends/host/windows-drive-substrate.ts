import type { ChildProcess } from 'child_process';
import { watch } from 'fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises';
import path from 'path';

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
import { isWslPathInsideRoot, toWindowsDrivePath, toWslPath } from './wsl-paths';
import { WslHostSubstrate } from './wsl-substrate';

export class WindowsDriveHostSubstrate implements HostRuntimeSubstrate {
  readonly platform = 'win32' as const;
  readonly kind = 'wsl' as const;
  readonly runtimeWorkspacePath = RUNTIME_WORKSPACE_PATH;

  private readonly commandSubstrate: WslHostSubstrate;

  constructor(options: { workspacePath: string; supportsCd?: boolean }) {
    this.commandSubstrate = new WslHostSubstrate(options);
  }

  toExecutionPath(nativePath: string): string {
    return toWslPath(nativePath);
  }

  toNativeHostPath(executionPath: string): string {
    return toWindowsDrivePath(executionPath);
  }

  isPathInsideRoot(nativePath: string, root: string): boolean {
    return isWslPathInsideRoot(nativePath, root);
  }

  shellCommand(opts: HostSubstrateSpawnOptions): HostSubstrateRendered {
    return this.commandSubstrate.shellCommand(opts);
  }

  execFileCommand(opts: HostSubstrateExecFileOptions): HostSubstrateRendered {
    return this.commandSubstrate.execFileCommand(opts);
  }

  terminalCommand(opts: { cwd: string; env?: Record<string, string> }): HostSubstrateRendered {
    return this.commandSubstrate.terminalCommand(opts);
  }

  readFile(filePath: string): Promise<Buffer> {
    return readFile(this.toNativeHostPath(filePath));
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    const nativePath = this.toNativeHostPath(filePath);
    await mkdir(path.win32.dirname(nativePath), { recursive: true });
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
    const nativePath = this.toNativeHostPath(filePath);
    const fileWatcher = watch(nativePath, { recursive: false }, (eventType, filename) => {
      onEvent({
        kind: eventType === 'rename' ? 'move' : 'modify',
        path: filename ? path.win32.join(filePath, filename.toString()) : filePath,
      });
    });
    return { close: async () => { fileWatcher.close(); } };
  }

  isSshAvailable(): Promise<boolean> {
    return this.commandSubstrate.isSshAvailable();
  }

  resolveExecutionPid(child: ChildProcess, rendered: HostSubstrateRendered): Promise<number | undefined> {
    return this.commandSubstrate.resolveExecutionPid(child, rendered);
  }

  signalChild(child: ChildProcess, rendered: HostSubstrateRendered, signal: NodeJS.Signals | number): Promise<void> {
    return this.commandSubstrate.signalChild(child, rendered, signal);
  }

  normalizeExecOutput(output: string): string {
    return this.commandSubstrate.normalizeExecOutput(output);
  }
}

export function createWindowsDriveHostSubstrate(options: { workspacePath: string; supportsCd?: boolean }): WindowsDriveHostSubstrate {
  return new WindowsDriveHostSubstrate(options);
}
