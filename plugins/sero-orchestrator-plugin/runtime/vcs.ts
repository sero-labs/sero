// VCS baseline + dirty-root start gate (D-07). Each attempt records a
// pre-attempt `baseRef = git rev-parse HEAD` captured BEFORE any mutation — the
// durable rollback target, not `host.git.createCheckpoint` (which returns null
// on a clean tree and otherwise commits *current* changes). git runs at the
// attempt cwd via `host.workspace.runCommand`, which only maps cwds inside the
// registered workspace root (02 §Verified facts).
//
// The gate never silently commits the user's work: on a dirty workspace root it
// offers auto-save / defer (isolate arrives in Phase 6) and auto-saves if there
// is no answer within the window. The *delivery* of the choice is a seam — a
// DirtyRootGate — so a later phase can wire a real UI round-trip; the default
// gate notifies and times out to auto-save.

import { createHash } from 'node:crypto';

import type { AppRuntimeHost } from '@sero-ai/common';

/** Sentinel baseRef when the cwd is not a git repo (e.g. greenfield). */
export const UNVERSIONED_BASE_REF = 'UNVERSIONED';

export async function captureBaseRef(
  host: AppRuntimeHost,
  workspaceId: string,
  cwd: string,
): Promise<string> {
  const result = await host.workspace.runCommand(workspaceId, cwd, 'git rev-parse HEAD');
  const ref = result.stdout.trim();
  if (result.exitCode !== 0 || !ref) return UNVERSIONED_BASE_REF;
  return ref;
}

export async function isWorkspaceDirty(
  host: AppRuntimeHost,
  workspaceId: string,
  cwd: string,
): Promise<boolean> {
  const result = await host.workspace.runCommand(workspaceId, cwd, 'git status --porcelain');
  if (result.exitCode !== 0) return false; // not versioned → nothing to preserve
  return result.stdout.trim().length > 0;
}

/** Commit the user's dirty work as a baseline so nothing is lost (D-07). */
export async function autoSaveBaseline(
  host: AppRuntimeHost,
  cwd: string,
): Promise<string | null> {
  return host.git.createCheckpoint(cwd, 'orchestrator: pre-attempt baseline');
}

/**
 * The files an attempt changed at its cwd, measured against the attempt baseline
 * (the worker never commits, so HEAD === baseRef and `git status` is the delta).
 * Includes untracked files the attempt created (D-06/D-07).
 */
export async function listChangedFiles(
  host: AppRuntimeHost,
  workspaceId: string,
  cwd: string,
): Promise<string[]> {
  const result = await host.workspace.runCommand(workspaceId, cwd, 'git status --porcelain');
  if (result.exitCode !== 0) return []; // not versioned → nothing measured
  const files: string[] = [];
  for (const line of result.stdout.split('\n')) {
    const path = parsePorcelainPath(line);
    if (path) files.push(path);
  }
  return files;
}

/** Hash of the attempt's diff — a proxy for "equivalent diff" in no-progress (D-13). */
export async function computeDiffFingerprint(host: AppRuntimeHost, cwd: string): Promise<string> {
  const diff = await host.git.getDiff(cwd);
  return createHash('sha1').update(diff).digest('hex');
}

/**
 * Roll an attempt back to its pre-attempt baseline (D-07): `git reset --hard
 * <baseRef>` restores tracked files, then a path-scoped `git clean` removes only
 * the untracked files the attempt created — never a blanket `git clean`, which
 * could delete unrelated user files. No-op on an unversioned tree.
 */
export async function restoreToBaseRef(
  host: AppRuntimeHost,
  workspaceId: string,
  cwd: string,
  baseRef: string,
  createdFiles: string[],
): Promise<void> {
  if (!baseRef || baseRef === UNVERSIONED_BASE_REF) return;
  await host.workspace.runCommand(workspaceId, cwd, `git reset --hard ${baseRef}`);
  const paths = createdFiles.filter(Boolean).map(shellQuote);
  if (paths.length) {
    await host.workspace.runCommand(workspaceId, cwd, `git clean -f -- ${paths.join(' ')}`);
  }
}

/** Path from a `git status --porcelain` line; new path for renames. */
function parsePorcelainPath(line: string): string | null {
  if (line.length < 4) return null;
  let path = line.slice(3);
  const arrow = path.indexOf(' -> ');
  if (arrow >= 0) path = path.slice(arrow + 4);
  return unquote(path.trim());
}

/** Git quotes paths with special chars in double quotes; strip them best-effort. */
function unquote(path: string): string {
  if (path.length >= 2 && path.startsWith('"') && path.endsWith('"')) {
    return path.slice(1, -1);
  }
  return path;
}

/** POSIX single-quote a path so it survives a shell command unchanged. */
function shellQuote(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

export type DirtyRootChoice = 'auto-save' | 'defer';

export interface DirtyRootPrompt {
  loopId: string;
  loopTitle: string;
  cwd: string;
}

export interface DirtyRootGate {
  /** The user's choice, or `'timeout'` if unanswered within the window. */
  prompt(info: DirtyRootPrompt): Promise<DirtyRootChoice | 'timeout'>;
}

/** Default window before an unanswered dirty-root prompt auto-saves. */
export const DEFAULT_DIRTY_ROOT_WINDOW_MS = 15_000;

/**
 * Default gate: notify the user, then — absent a UI response channel (built in a
 * later phase) — resolve `'timeout'` after the window so unattended loops
 * auto-save and proceed (D-07). Phase 2 never reaches this in production (no
 * adapter is registered, so `run_next` returns early); tests inject fakes.
 */
export function createDefaultDirtyRootGate(
  host: AppRuntimeHost,
  windowMs: number = DEFAULT_DIRTY_ROOT_WINDOW_MS,
): DirtyRootGate {
  return {
    prompt(info) {
      host.notifications.notify({
        type: 'warning',
        source: 'orchestrator',
        message: `Unsaved changes in "${info.loopTitle}". Saving a baseline before the next attempt.`,
      });
      return new Promise((resolve) => {
        setTimeout(() => resolve('timeout'), windowMs);
      });
    },
  };
}
