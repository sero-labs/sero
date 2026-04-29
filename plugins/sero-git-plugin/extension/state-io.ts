/**
 * Git app state file I/O helpers.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { GitAppState } from '../shared/types';
import { createDefaultGitState, normalizeGitState } from '../shared/types';

const STATE_REL_PATH = path.join('.sero', 'apps', 'git', 'state.json');

export function resolveStatePath(cwd: string): string {
  return path.join(cwd, STATE_REL_PATH);
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function createStateReadError(filePath: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(
    `Git app state at ${filePath} is unreadable. Repair or remove the malformed file before retrying. Original error: ${detail}`,
  );
}

export async function readState(filePath: string): Promise<GitAppState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalizeGitState(JSON.parse(raw) as Partial<GitAppState>);
  } catch (error) {
    if (isMissingFileError(error)) {
      return createDefaultGitState();
    }
    throw createStateReadError(filePath, error);
  }
}

export async function writeState(filePath: string, state: GitAppState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}
