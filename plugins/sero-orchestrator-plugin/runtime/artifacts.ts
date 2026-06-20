// Large-output retention (D-14). The state file holds only bounded summaries;
// full command output, diffs, and worker responses live in artifact files under
// the state dir and are referenced by path. Artifacts are written with plain
// `node:fs` (the runtime is in Electron main with host filesystem access) — the
// state dir is a host path, so artifacts travel with the workspace.
//
// Stored paths are RELATIVE to the state dir (e.g. `artifacts/<attemptId>/x.txt`)
// so the JSON never leaks absolute host layout; resolve against the state dir
// when reading.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { LoopAttempt, LoopGoal } from '../shared/types';

const ARTIFACT_DIR = 'artifacts';

/** Absolute artifact root for a given state file. */
export function artifactRootFor(stateFilePath: string): string {
  return join(dirname(stateFilePath), ARTIFACT_DIR);
}

/**
 * Write a blob to `<stateDir>/artifacts/<attemptId>/<name>` and return the path
 * relative to the state dir. `name` should already be filesystem-safe.
 */
export async function writeArtifact(
  stateFilePath: string,
  attemptId: string,
  name: string,
  content: string,
): Promise<string> {
  const dir = join(artifactRootFor(stateFilePath), attemptId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), content, 'utf8');
  return join(ARTIFACT_DIR, attemptId, name);
}

/**
 * Trim a loop's attempts to `retainAttempts` (newest kept), mutating the array
 * in place. Returns the removed attempts so the caller can delete their
 * artifacts afterwards (it cannot await inside the synchronous state mutator).
 */
export function trimAttempts(loop: LoopGoal): LoopAttempt[] {
  const keep = Math.max(0, loop.logPolicy.retainAttempts);
  if (loop.attempts.length <= keep) return [];
  const cut = loop.attempts.length - keep;
  const removed = loop.attempts.slice(0, cut);
  loop.attempts = loop.attempts.slice(cut);
  return removed;
}

/** Delete the artifact directories of pruned attempts (when not retained). */
export async function deleteAttemptArtifacts(
  stateFilePath: string,
  attemptIds: string[],
): Promise<void> {
  const root = artifactRootFor(stateFilePath);
  for (const id of attemptIds) {
    await rm(join(root, id), { recursive: true, force: true });
  }
}

/** Make an arbitrary check id safe to use as a filename segment. */
export function safeArtifactName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_');
}
