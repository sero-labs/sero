import type { ChildProcess } from 'child_process';

export interface HostSubstrateRendered {
  program: string;
  args: string[];
  nativeCwd: string;
  env?: Record<string, string>;
  innerPidFile?: string;
}

export interface HostSubstrateSpawnOptions {
  command: string;
  cwd: string;
  env?: Record<string, string>;
  loginShell?: boolean;
}

export interface HostSubstrateExecFileOptions {
  program: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
}

export interface HostSubstrateFileEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink';
}

export interface HostSubstrateFileWatchEvent {
  kind: 'modify' | 'create' | 'delete' | 'move';
  path: string;
}

export interface HostSubstrateFileWatch {
  close(): Promise<void>;
}

export interface HostSubstrateStat {
  size: number;
  mtimeMs: number;
  type: 'file' | 'directory' | 'symlink';
}

export interface HostRuntimeSubstrate {
  readonly platform: NodeJS.Platform;
  readonly kind: 'posix' | 'wsl';
  readonly runtimeWorkspacePath: string;

  toExecutionPath(nativePath: string): string;
  toNativeHostPath(executionPath: string): string;
  isPathInsideRoot(nativePath: string, root: string): boolean;
  resolvePathInsideRoot(nativePath: string, root: string): Promise<string | null>;

  shellCommand(opts: HostSubstrateSpawnOptions): HostSubstrateRendered;
  execFileCommand(opts: HostSubstrateExecFileOptions): HostSubstrateRendered;
  terminalCommand(opts: { cwd: string; env?: Record<string, string> }): HostSubstrateRendered;

  readFile(path: string): Promise<Buffer>;
  writeFile(path: string, data: Buffer): Promise<void>;
  listFiles(path: string): Promise<HostSubstrateFileEntry[]>;
  stat(path: string): Promise<HostSubstrateStat>;
  rename(from: string, to: string): Promise<void>;
  delete(path: string, opts?: { recursive?: boolean }): Promise<void>;
  createDirectory(path: string, opts?: { recursive?: boolean }): Promise<void>;
  watchFiles(path: string, onEvent: (event: HostSubstrateFileWatchEvent) => void): Promise<HostSubstrateFileWatch>;

  isSshAvailable(): Promise<boolean>;
  resolveExecutionPid?(child: ChildProcess, rendered: HostSubstrateRendered): Promise<number | undefined>;
  signalChild(child: ChildProcess, rendered: HostSubstrateRendered, signal: NodeJS.Signals | number): Promise<void>;
  normalizeExecOutput(output: string): string;
}
