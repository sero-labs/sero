/**
 * The narrow host surface the Architect runtime uses, on the Orchestrator's
 * `OrchestratorHost` precedent: tests fake this interface in full, and the
 * production adapter is the only place that knows `AppRuntimeContext`.
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';

import type {
  AppRuntimeContext,
  AppRuntimeStartManagedDevServerOptions,
  AppRuntimeStartManagedDevServerResult,
  AppRuntimeSubagentResult,
  AppRuntimeSubagentRunParams,
  AppRuntimeWorkspaceInfo,
  PersistentSessionsApi,
  SharedAvailableModelGroup,
} from '@sero-ai/common';

import type { ArchitectIndex } from '../shared/types';

export interface CommandRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ArchitectHost {
  /** `<SERO_HOME>/apps/architect`, created if missing. */
  homeDir(): Promise<string>;
  /** The app state file path the host watches; the index lives there. */
  indexFile: string;
  updateIndex(updater: (current: ArchitectIndex | null) => ArchitectIndex): Promise<void>;
  listWorkspaces(): Promise<AppRuntimeWorkspaceInfo[]>;
  createWorkspace(name: string, parentPath: string): Promise<AppRuntimeWorkspaceInfo>;
  /** Present only when the built-in gate admitted this plugin. */
  persistentSessions: PersistentSessionsApi | null;
  listModels(): Promise<SharedAvailableModelGroup[]>;
  runStructured(params: AppRuntimeSubagentRunParams): Promise<AppRuntimeSubagentResult>;
  /** One shell command through the workspace runtime, with its real exit code. */
  runCommand(workspaceId: string, cwd: string, command: string, timeoutMs?: number): Promise<CommandRun>;
  /** A local binary (git) in a directory, outside any workspace runtime. */
  exec(file: string, args: string[], cwd: string): Promise<CommandRun>;
  detectDevServerCommand(workspacePath: string): Promise<string | null>;
  startDevServer(options: AppRuntimeStartManagedDevServerOptions): Promise<AppRuntimeStartManagedDevServerResult>;
  stopDevServer(serverId: string): Promise<boolean>;
  /** Watches a state file of ANY app and delivers each change. Returns the unsubscribe. */
  onStateChange(filePath: string, listener: (state: unknown) => void): () => void;
  readJson(filePath: string): Promise<unknown | null>;
  fileInfo(filePath: string): Promise<{ mtimeMs: number; size: number; head: Buffer } | null>;
  notify(message: string, type: 'info' | 'warning' | 'error'): void;
  now(): string;
  newId(prefix: string): string;
  log(message: string): void;
  env: NodeJS.ProcessEnv;
}

export function execLocal(file: string, args: string[], cwd: string): Promise<CommandRun> {
  return new Promise((resolve) => {
    execFile(file, args, { cwd, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error && typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : error ? 1 : 0;
      resolve({ exitCode: code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

export async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export async function fileInfoOf(filePath: string): Promise<{ mtimeMs: number; size: number; head: Buffer } | null> {
  try {
    const stat = await fs.stat(filePath);
    const handle = await fs.open(filePath, 'r');
    try {
      const head = Buffer.alloc(8);
      const { bytesRead } = await handle.read(head, 0, 8, 0);
      return { mtimeMs: stat.mtimeMs, size: stat.size, head: head.subarray(0, bytesRead) };
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

export function createArchitectHost(ctx: AppRuntimeContext): ArchitectHost {
  const { host } = ctx;
  return {
    homeDir: async () => (await host.appState.globalDir('architect')).path,
    indexFile: ctx.stateFilePath,
    updateIndex: (updater) => host.appState.update<ArchitectIndex>(ctx.stateFilePath, updater),
    listWorkspaces: () => host.workspace.list(),
    createWorkspace: (name, parentPath) => host.workspace.create(name, parentPath, { requireEmpty: false }),
    persistentSessions: host.persistentSessions ?? null,
    listModels: () => host.models.list(),
    runStructured: (params) => host.subagents.runStructured(params),
    runCommand: async (workspaceId, cwd, command, timeoutMs) => {
      const result = await host.workspace.runCommand(workspaceId, cwd, command, timeoutMs);
      return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
    },
    exec: execLocal,
    detectDevServerCommand: (workspacePath) => host.verification.detectDevServerCommand(workspacePath),
    startDevServer: (options) => host.devServers.startManaged(options),
    stopDevServer: (serverId) => host.devServers.stop(serverId),
    onStateChange: (filePath, listener) => {
      const subscribe = host.appState.onChange;
      if (!subscribe) throw new Error('This host does not deliver watched state changes to runtimes (appState.onChange is absent).');
      host.appState.watch(filePath);
      const off = subscribe.call(host.appState, filePath, listener);
      return () => {
        off();
        host.appState.unwatch(filePath);
      };
    },
    readJson: readJsonFile,
    fileInfo: fileInfoOf,
    notify: (message, type) => host.notifications.notify({ message, type, source: 'Architect' }),
    now: () => new Date().toISOString(),
    newId: (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`,
    log: (message) => console.log(`[architect] ${message}`),
    env: process.env,
  };
}
