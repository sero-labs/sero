/**
 * Shared types, constants, and helpers for the container subsystem.
 *
 * ContainerState is the canonical container shape — imported by both
 * Electron main process and renderer (via src/types/ipc.ts re-export).
 */

import path from 'path';
import os from 'os';
import type { NativeBuildToolsRequiredMetadata } from '@electron/features/workspace/runtime/native-build/types';

export const CONTAINER_BIN = '/usr/local/bin/container';

// Apple Container and Docker intentionally share the exact sero-node image so
// both runtimes expose the same Linux toolchain on arm64 Macs and amd64/arm64
// Docker hosts. Release builds set SERO_NODE_IMAGE_TAG to a pinned version;
// development falls back to :latest until the release pipeline injects a tag.
export const SERO_NODE_IMAGE_REPOSITORY = 'ghcr.io/sero-labs/sero-node';
export const SERO_NODE_DEV_IMAGE_TAG = 'latest';
export const SERO_NODE_IMAGE_TAG = process.env.SERO_NODE_IMAGE_TAG?.trim() || SERO_NODE_DEV_IMAGE_TAG;
export const DEFAULT_IMAGE = `${SERO_NODE_IMAGE_REPOSITORY}:${SERO_NODE_IMAGE_TAG}`;

export function seroNodeImageVersionFromRef(imageRef: string): string {
  const prefix = `${SERO_NODE_IMAGE_REPOSITORY}:`;
  if (!imageRef.startsWith(prefix)) return SERO_NODE_DEV_IMAGE_TAG;
  return imageRef.slice(prefix.length) || SERO_NODE_DEV_IMAGE_TAG;
}

export const DEFAULT_CPUS = 2;
export const DEFAULT_MEMORY_MB = 1024;
export const WORKSPACE_MOUNT = '/workspace';

// ── Error helpers ────────────────────────────────────────────

/** Extract a human-readable message from an unknown error value. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>;
    return String(e.message ?? e.stderr ?? err);
  }
  return String(err);
}

/** Errors that indicate the container API server is not running / needs restart. */
export function isXpcError(err: unknown): boolean {
  const msg = errorMessage(err);
  return (
    msg.includes('XPC connection error') ||
    msg.includes('Connection invalid') ||
    msg.includes('container system start')
  );
}

/** Errors that indicate a ghost container (exists in registry but storage is corrupted/missing). */
export function isGhostError(err: unknown): boolean {
  const msg = errorMessage(err);
  return (
    msg.includes("couldn't be opened because there is no such file") ||
    (msg.includes('config.json') &&
      (msg.includes('No such file or directory') || msg.includes('internalError')))
  );
}

// ── Core types ───────────────────────────────────────────────

export interface ContainerConfig {
  /** Workspace ID (used to derive container name). */
  workspaceId: string;
  /** Host path to workspace root (bind-mounted to /workspace). */
  hostPath: string;
  image?: string;
  cpus?: number;
  memoryMB?: number;
  /**
   * Additional host directories to bind-mount read-only into the container
   * at the same absolute path. Used for skills, prompts, etc. that the agent
   * needs to read but should not modify.
   * Directories that don't exist on the host are silently skipped.
   */
  readOnlyMounts?: string[];
  /**
   * Additional host directories to bind-mount read-write into the container
   * at the same absolute path. Used for cross-workspace access (e.g. the
   * global workspace) where the agent needs both read and write access.
   * Directories that don't exist on the host are silently skipped.
   */
  writableMounts?: string[];
  /** Internal preview gateway ports published to loopback host ports at creation. */
  previewPortMappings?: Array<{ internalPort: number; hostPort?: number }>;
}

/**
 * Container state — single source of truth.
 * Re-exported as `ContainerInfo` in `src/types/ipc.ts` for renderer use.
 */
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
  nativeBuildToolsRequired?: NativeBuildToolsRequiredMetadata;
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
