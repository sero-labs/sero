// State file + captures path resolution and atomic I/O for the Loom extension.
// Pi-CLI-safe: resolves global paths from SERO_HOME (Sero) and falls back to a
// workspace-relative .sero path (Pi CLI).

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { LoomState } from '../shared/types';
import { DEFAULT_LOOM_STATE, normalizeLoomState, structuredCloneState } from '../shared/types';

const APP_ID = 'loom';
const STATE_REL_PATH = path.join('.sero', 'apps', APP_ID, 'state.json');

function appDir(cwd: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) return path.join(seroHome, 'apps', APP_ID);
  return path.join(cwd, '.sero', 'apps', APP_ID);
}

export function resolveStatePath(cwd: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) return path.join(seroHome, 'apps', APP_ID, 'state.json');
  return path.join(cwd, STATE_REL_PATH);
}

export function resolveCapturesDir(cwd: string): string {
  return path.join(appDir(cwd), 'captures');
}

export async function readState(filePath: string): Promise<LoomState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalizeLoomState(JSON.parse(raw));
  } catch {
    return structuredCloneState(DEFAULT_LOOM_STATE);
  }
}

// Serialize writes per path so concurrent tool calls don't clobber each other.
const writeQueues = new Map<string, Promise<void>>();

export async function writeState(filePath: string, state: LoomState): Promise<void> {
  const previous = writeQueues.get(filePath) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}.${randomUUID()}`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(tmp, filePath);
  });
  writeQueues.set(filePath, next);
  try {
    await next;
  } finally {
    if (writeQueues.get(filePath) === next) writeQueues.delete(filePath);
  }
}

export async function writeCapture(
  cwd: string,
  pngBuffer: Buffer,
  name: string,
  sidecarConfig: unknown | null,
): Promise<string> {
  const dir = resolveCapturesDir(cwd);
  await fs.mkdir(dir, { recursive: true });
  const safe = name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'loom';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const base = `${safe}-${stamp}`;
  const pngPath = path.join(dir, `${base}.png`);
  await fs.writeFile(pngPath, pngBuffer);
  if (sidecarConfig) {
    await fs.writeFile(path.join(dir, `${base}.json`), JSON.stringify(sidecarConfig, null, 2), 'utf8');
  }
  return pngPath;
}
