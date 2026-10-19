/**
 * Managed dev servers a runtime can start, list and follow. Split from
 * app-runtime-background.ts (500-LOC limit) and re-exported there.
 */

export type AppRuntimeDevServerScope = 'workspace' | 'card-preview';
/** `failed` means the server's process exited on its own; `stopped` means Sero stopped it. */
export type AppRuntimeDevServerStatus = 'running' | 'stopped' | 'starting' | 'failed';

export interface AppRuntimeDevServer {
  id: string;
  workspaceId: string;
  name: string;
  port: number;
  url: string;
  framework?: string;
  command: string;
  cwd: string;
  scope: AppRuntimeDevServerScope;
  cardId?: string;
  status: AppRuntimeDevServerStatus;
  registeredAt: string;
  /** How the process ended, when Sero saw it end. Absent while it runs or when Sero did not observe the exit. */
  exit?: { exitCode: number | null; signal?: string };
}

/** A server was registered, changed status or was removed. Read `list` for its state. */
export interface AppRuntimeDevServerChange {
  workspaceId: string;
  serverId: string;
}

export interface AppRuntimeStartManagedDevServerOptions {
  workspaceId: string;
  workspacePath: string;
  cwdPath: string;
  command: string;
  name?: string;
  framework?: string;
  scope?: AppRuntimeDevServerScope;
  cardId?: string;
  logPath?: string;
}

export interface AppRuntimeStartManagedDevServerResult {
  serverId?: string;
  url?: string;
  port?: number;
  reason?: string;
}

export interface AppRuntimeDevServersApi {
  startManaged(
    options: AppRuntimeStartManagedDevServerOptions,
  ): Promise<AppRuntimeStartManagedDevServerResult>;
  list(workspaceId: string): AppRuntimeDevServer[];
  stop(serverId: string): Promise<boolean>;
  restart(serverId: string): Promise<boolean>;
  unregister(serverId: string): boolean;
  /** Calls the listener after every change to any workspace's servers. Returns the unsubscribe. */
  onChange(listener: (change: AppRuntimeDevServerChange) => void): () => void;
}
