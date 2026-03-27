/**
 * Git app state file I/O helpers.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { GitAppState } from '../shared/types';
import { DEFAULT_GIT_STATE } from '../shared/types';

const STATE_REL_PATH = path.join('.sero', 'apps', 'git', 'state.json');

export function resolveStatePath(cwd: string): string {
  return path.join(cwd, STATE_REL_PATH);
}

export async function readState(filePath: string): Promise<GitAppState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as GitAppState;
  } catch {
    return { ...DEFAULT_GIT_STATE };
  }
}

export async function writeState(filePath: string, state: GitAppState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}
