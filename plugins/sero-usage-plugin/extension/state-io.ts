/**
 * State + path resolution for the Usage plugin.
 *
 * This is a Sero-only built-in plugin: paths resolve exclusively from the
 * Sero-provided env vars. There is deliberately no ~/.pi/agent or cwd
 * fallback.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { UsageState } from '../shared/types';
import { normalizeUsageState } from '../shared/types';

export const APP_ID = 'usage';

/** Sessions live under the profile's agent dir: `${PI_CODING_AGENT_DIR}/sessions`. */
export function resolveSessionsDir(): string {
  const agentDir = process.env.PI_CODING_AGENT_DIR;
  if (!agentDir) {
    throw new Error(
      'PI_CODING_AGENT_DIR is not set. The Usage plugin is Sero-only and reads sessions from the active profile.',
    );
  }
  return path.join(agentDir, 'sessions');
}

function resolveAppDataDir(): string {
  const seroHome = process.env.SERO_HOME;
  if (!seroHome) {
    throw new Error('SERO_HOME is not set. The Usage plugin is Sero-only and stores state per profile.');
  }
  return path.join(seroHome, 'apps', APP_ID);
}

export function resolveStatePath(): string {
  return path.join(resolveAppDataDir(), 'state.json');
}

export function resolveScanCachePath(): string {
  return path.join(resolveAppDataDir(), 'scan-cache.json');
}

/** Missing or corrupt state is never fatal — fall back to defaults. */
export async function readState(filePath: string): Promise<UsageState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalizeUsageState(JSON.parse(raw));
  } catch {
    return normalizeUsageState(null);
  }
}

const writeQueues = new Map<string, Promise<void>>();

/** Atomic, per-file-serialised write (temp file → rename). */
export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  const previous = writeQueues.get(filePath) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmpPath, JSON.stringify(value), 'utf8');
    await fs.rename(tmpPath, filePath);
  });
  writeQueues.set(filePath, next);
  try {
    await next;
  } finally {
    if (writeQueues.get(filePath) === next) writeQueues.delete(filePath);
  }
}
