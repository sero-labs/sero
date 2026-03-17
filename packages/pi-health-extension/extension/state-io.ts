/**
 * Atomic state file I/O with mutex for the health extension.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { HealthState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';

const STATE_REL_PATH = path.join('.sero', 'apps', 'health', 'state.json');

/** Resolve state path: global (SERO_HOME) or workspace-relative. */
export function resolveStatePath(cwd: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) {
    return path.join(seroHome, 'apps', 'health', 'state.json');
  }
  return path.join(cwd, STATE_REL_PATH);
}

/** Runtime validation of parsed state JSON. */
function isValidState(data: unknown): data is HealthState {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.nextId === 'number' &&
    typeof obj.userContext === 'object' &&
    Array.isArray(obj.nutritionLog) &&
    Array.isArray(obj.workoutLog) &&
    Array.isArray(obj.bodyMetrics) &&
    Array.isArray(obj.longTermGoals)
  );
}

/** Read state from disk. Returns default state on error. */
export async function readState(filePath: string): Promise<HealthState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!isValidState(parsed)) return { ...DEFAULT_STATE };
    return parsed;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

/** Atomic write: temp file + rename to prevent corrupt reads. */
export async function writeState(filePath: string, state: HealthState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}
