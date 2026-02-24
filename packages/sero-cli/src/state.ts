/**
 * Shared state file I/O for local CLI commands.
 *
 * Matches the exact patterns used by existing extensions:
 * - Atomic writes via tmp file + rename
 * - SERO_HOME-based resolution for global-scoped apps
 * - Workspace-relative resolution for workspace-scoped apps
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Resolve state file path for a global-scoped app.
 * - SERO_HOME set: ~/.sero-ui/apps/<appId>/state.json
 * - Fallback: <cwd>/.sero/apps/<appId>/state.json
 */
export function resolveGlobalStatePath(appId: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) {
    return path.join(seroHome, 'apps', appId, 'state.json');
  }
  return path.join(process.cwd(), '.sero', 'apps', appId, 'state.json');
}

/**
 * Resolve state file path for a workspace-scoped app.
 * Always relative to cwd.
 */
export function resolveWorkspaceStatePath(appId: string): string {
  return path.join(process.cwd(), '.sero', 'apps', appId, 'state.json');
}

/** Read and parse a JSON state file. Returns the default if not found. */
export async function readState<T>(filePath: string, defaultState: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return { ...defaultState };
  }
}

/** Atomic write: write to temp file, then rename. */
export async function writeState<T>(filePath: string, state: T): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}
