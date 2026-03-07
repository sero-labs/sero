/**
 * State file I/O helpers for the research extension.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ResearchState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';

const STATE_REL_PATH = path.join('.sero', 'apps', 'research', 'state.json');

export function resolveStatePath(cwd: string): string {
  return path.join(cwd, STATE_REL_PATH);
}

export async function readState(filePath: string): Promise<ResearchState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as ResearchState;
  } catch {
    return { ...DEFAULT_STATE, history: [] };
  }
}

export async function writeState(filePath: string, state: ResearchState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

/**
 * Count lines in a file. Returns 0 if the file doesn't exist.
 */
export async function countLines(filePath: string): Promise<number> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

/**
 * Read file contents. Returns empty string if the file doesn't exist.
 */
export async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Create a directory and write initial skeleton content to a file.
 */
export async function writeSkeletonFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}
