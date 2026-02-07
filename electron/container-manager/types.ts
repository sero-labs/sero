import path from 'path';
import os from 'os';

export const CONTAINER_BIN = '/usr/local/bin/container';
export const DEFAULT_IMAGE = 'sero-node:latest';
export const DEFAULT_CPUS = 2;
export const DEFAULT_MEMORY_MB = 1024;
export const SERO_LABEL_KEY = 'sero.project';

/** Errors that indicate the container API server is not running / needs restart */
export function isXpcError(err: any): boolean {
  const msg = String(err?.message ?? err?.stderr ?? '');
  return msg.includes('XPC connection error') ||
         msg.includes('Connection invalid') ||
         msg.includes('container system start');
}

/** Errors that indicate a ghost container (exists in registry but storage is corrupted/missing) */
export function isGhostError(err: any): boolean {
  const msg = String(err?.message ?? err?.stderr ?? '');
  return msg.includes("couldn't be opened because there is no such file") ||
         (msg.includes('config.json') && (msg.includes('No such file or directory') || msg.includes('internalError')));
}

export interface ContainerConfig {
  id: string;
  name: string;
  image?: string;
  cpus?: number;
  memoryMB?: number;
  ports?: Array<{ host: number; container: number }>;
  volumes?: Array<{ hostPath: string; containerPath: string; readonly?: boolean }>;
}

export interface ContainerState {
  id: string;
  image: string;
  state: 'running' | 'stopped' | 'unknown';
  ipAddress?: string;
  cpus: number;
  memoryBytes: number;
  ports: Array<{ host: number; container: number }>;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Derive container name from project ID */
export function containerId(projectId: string): string {
  return `sero-${projectId}`;
}

/** Host directory for a project's workspace files (persists across container lifecycle) */
export function hostWorkspacePath(projectId: string): string {
  return path.join(os.homedir(), '.sero', 'workspaces', projectId);
}

/** Path to the container's storage directory (used for ghost cleanup) */
export function containerStoragePath(cid: string): string {
  return path.join(
    os.homedir(),
    'Library', 'Application Support', 'com.apple.container', 'containers', cid
  );
}
