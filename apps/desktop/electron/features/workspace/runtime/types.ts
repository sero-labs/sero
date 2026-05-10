import type { DoctorResult } from '@electron/features/doctor/engine/types';

export type RuntimeBackendId = 'apple-container' | 'docker' | 'mac-host';
export type RuntimeWorkspaceAccess = 'host' | 'live-mount';
export type RuntimeDoctorCheck = DoctorResult;

export interface RuntimeCapabilities {
  exec: boolean;
  processes: {
    spawn: boolean;
    stdio: boolean;
    signal: boolean;
    longRunning: boolean;
  };
  files: {
    read: boolean;
    write: boolean;
    edit: boolean;
    list: boolean;
    mutateTree: boolean;
    watch: boolean;
  };
  vcs: {
    git: boolean;
    worktrees: boolean;
    pullRequests: boolean;
  };
  terminal: boolean;
  devServers: {
    start: boolean;
    stop: boolean;
    restart: boolean;
    status: boolean;
  };
  ports: {
    discover: boolean;
    forward: boolean;
    stopForward: boolean;
    previewUrl: boolean;
  };
  logs: boolean;
  browserAutomation: boolean;
  languageServers: boolean;
}

export interface RuntimeHealth {
  backend: RuntimeBackendId;
  status: 'ready' | 'starting' | 'missing' | 'stopped' | 'error' | 'unsupported';
  message: string;
  detail?: string;
  checks?: RuntimeDoctorCheck[];
}

export interface RuntimeSession {
  backend: RuntimeBackendId;
  workspaceId: string;
  hostWorkspacePath: string;
  runtimeWorkspacePath: string;
  state: 'running' | 'stopped' | 'unknown';
  containerId?: string;
}

export interface RuntimeExecInput {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  injectGitAuth?: boolean;
}

export interface RuntimeExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RuntimeProcessInput extends RuntimeExecInput {
  stdio?: 'pipe' | 'inherit';
  cols?: number;
  rows?: number;
}

export interface RuntimeProcess {
  pid?: number;
  write(input: string): void;
  resize?(cols: number, rows: number): void;
  signal(signal: NodeJS.Signals | number): void;
  onData(cb: (chunk: string) => void): () => void;
  onExit(cb: (exit: { exitCode: number | null; signal?: string }) => void): () => void;
}

export interface RuntimeFileRef { path: string; encoding?: BufferEncoding; }
export interface RuntimeReadFileInput extends RuntimeFileRef { binary?: boolean; }
export interface RuntimeFileReadResult { content: string; encoding: BufferEncoding | 'base64'; }
export interface RuntimeWriteFileInput extends RuntimeFileRef { content: string; mode?: number; }
export interface RuntimeListFilesInput { path: string; recursive?: boolean; limit?: number; }
export interface RuntimeDirectoryEntry { name: string; path: string; type: 'file' | 'directory'; size: number; }
export interface RuntimeRenameInput { oldPath: string; newPath: string; }
export interface RuntimeDeleteInput { path: string; recursive?: boolean; }
export interface RuntimeCreateFileInput extends RuntimeWriteFileInput { overwrite?: boolean; }
export interface RuntimeCreateDirectoryInput { path: string; recursive?: boolean; }

export interface RuntimeFileWatchInput { paths: string[]; }
export interface RuntimeFileWatch { close(): Promise<void>; }

export interface RuntimeTerminalInput { terminalId: string; cwd?: string; cols?: number; rows?: number; }
export interface RuntimeTerminalSession extends RuntimeProcess { terminalId: string; replayBuffer(): string; }

export interface RuntimeDevServerStartInput {
  command: string;
  cwd: string;
  name?: string;
  framework?: string;
  scope?: 'workspace' | 'card';
  cardId?: string;
  logPath?: string;
}
export interface RuntimeDevServer { id: string; port: number; url: string; command: string; cwd: string; }
export interface RuntimeDevServerStopInput { serverId: string; }
export interface RuntimeDevServerRestartInput { serverId: string; }
export interface RuntimeDevServerStatusInput { serverId?: string; }
export interface RuntimeDevServerStatus { servers: RuntimeDevServer[]; }

export interface RuntimeForwardPortInput { targetPort: number; protocol?: 'http' | 'tcp'; label?: string; }
export interface RuntimeForwardedPort { targetPort: number; hostPort: number; url: string; bridged: boolean; }
export interface RuntimeStopForwardInput { targetPort: number; hostPort?: number; }
export interface RuntimePreviewUrlInput { targetPort: number; path?: string; }
export interface RuntimePreviewUrl { url: string; targetPort: number; hostPort?: number; backend: RuntimeBackendId; }

export interface RuntimeLogInput { scope?: 'lifecycle' | 'dev-server' | 'terminal'; id?: string; }
export interface RuntimeLogEvent { timestamp: string; level: 'debug' | 'info' | 'warn' | 'error'; message: string; }

export interface RuntimeBackend {
  readonly backend: RuntimeBackendId;
  readonly workspaceId: string;
  readonly hostWorkspacePath: string;
  readonly runtimeWorkspacePath: string;
  readonly workspaceAccess: RuntimeWorkspaceAccess;
  readonly capabilities: RuntimeCapabilities;

  health(): Promise<RuntimeHealth>;
  ensure(): Promise<RuntimeSession>;
  destroy(): Promise<void>;

  exec(input: RuntimeExecInput): Promise<RuntimeExecResult>;
  spawn(input: RuntimeProcessInput): Promise<RuntimeProcess>;

  readFile(input: RuntimeReadFileInput): Promise<RuntimeFileReadResult>;
  writeFile(input: RuntimeWriteFileInput): Promise<void>;
  listFiles(input: RuntimeListFilesInput): Promise<RuntimeDirectoryEntry[]>;
  rename(input: RuntimeRenameInput): Promise<void>;
  delete(input: RuntimeDeleteInput): Promise<void>;
  createFile(input: RuntimeCreateFileInput): Promise<void>;
  createDirectory(input: RuntimeCreateDirectoryInput): Promise<void>;
  watchFiles(input: RuntimeFileWatchInput): Promise<RuntimeFileWatch>;

  createTerminal(input: RuntimeTerminalInput): Promise<RuntimeTerminalSession>;

  startDevServer(input: RuntimeDevServerStartInput): Promise<RuntimeDevServer>;
  stopDevServer(input: RuntimeDevServerStopInput): Promise<void>;
  restartDevServer(input: RuntimeDevServerRestartInput): Promise<RuntimeDevServer>;
  getDevServerStatus(input: RuntimeDevServerStatusInput): Promise<RuntimeDevServerStatus>;

  forwardPort(input: RuntimeForwardPortInput): Promise<RuntimeForwardedPort>;
  stopForward(input: RuntimeStopForwardInput): Promise<void>;
  resolvePreviewUrl(input: RuntimePreviewUrlInput): Promise<RuntimePreviewUrl>;

  streamLogs?(input: RuntimeLogInput): AsyncIterable<RuntimeLogEvent>;
}
