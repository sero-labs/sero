/**
 * Shared types, constants, and helpers for the container subsystem.
 */

import path from 'path';
import os from 'os';

export const CONTAINER_BIN = '/usr/local/bin/container';
export const DEFAULT_IMAGE = 'sero-node:latest';
export const DEFAULT_CPUS = 2;
export const DEFAULT_MEMORY_MB = 1024;
export const WORKSPACE_MOUNT = '/workspace';

/** Errors that indicate the container API server is not running / needs restart. */
export function isXpcError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? (err as any)?.stderr ?? '');
  return (
    msg.includes('XPC connection error') ||
    msg.includes('Connection invalid') ||
    msg.includes('container system start')
  );
}

/** Errors that indicate a ghost container (exists in registry but storage is corrupted/missing). */
export function isGhostError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? (err as any)?.stderr ?? '');
  return (
    msg.includes("couldn't be opened because there is no such file") ||
    (msg.includes('config.json') &&
      (msg.includes('No such file or directory') || msg.includes('internalError')))
  );
}

export interface ContainerConfig {
  /** Workspace ID (used to derive container name). */
  workspaceId: string;
  /** Host path to workspace root (bind-mounted to /workspace). */
  hostPath: string;
  image?: string;
  cpus?: number;
  memoryMB?: number;
}

export interface ContainerState {
  id: string;
  image: string;
  state: 'running' | 'stopped' | 'unknown';
  ipAddress?: string;
  cpus: number;
  memoryBytes: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Derive container name from workspace ID. */
export function containerId(workspaceId: string): string {
  return `sero-${workspaceId}`;
}

/** Path to the container's storage directory (used for ghost cleanup). */
export function containerStoragePath(cid: string): string {
  return path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'com.apple.container',
    'containers',
    cid,
  );
}
