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
