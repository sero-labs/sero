// State file + captures path resolution and atomic I/O for the Loom extension.
// Pi-CLI-safe: resolves global paths from SERO_HOME (Sero) and falls back to a
// workspace-relative .sero path (Pi CLI). Also hosts the push-based (fs.watch,
// never polling) wait used by the build-report and see handshakes.

import { randomUUID } from 'node:crypto';
import { promises as fs, watch, type FSWatcher } from 'node:fs';
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

export function resolveSeeDir(cwd: string): string {
  return path.join(appDir(cwd), 'see');
}

export async function readState(filePath: string): Promise<LoomState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalizeLoomState(JSON.parse(raw));
  } catch {
    return structuredCloneState(DEFAULT_LOOM_STATE);
  }
}

async function atomicWrite(filePath: string, state: LoomState): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}.${randomUUID()}`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmp, filePath);
}

// Serialize the WHOLE read-modify-write per path so overlapping tool calls can't
// clobber each other (a write queue alone leaves a stale-read race between
// concurrent read→mutate→write transactions).
const txQueues = new Map<string, Promise<unknown>>();

/**
 * Atomically read, mutate, and write Loom state under a per-path lock. The
 * mutator runs against freshly-read state and may mutate it in place or return a
 * new state. Returns the persisted state.
 */
export function updateLoomState(
  filePath: string,
  mutate: (state: LoomState) => LoomState | void,
): Promise<LoomState> {
  const prev = txQueues.get(filePath) ?? Promise.resolve();
  const run = prev
    .catch(() => undefined)
    .then(async () => {
      const state = await readState(filePath);
      const next = mutate(state) ?? state;
      await atomicWrite(filePath, next);
      return next;
    });
  txQueues.set(filePath, run.catch(() => undefined));
  return run;
}

/**
 * Resolve as soon as the state file satisfies `predicate`, or with null on
 * timeout. Push-based: an fs.watch on the state directory (atomic writes land
 * as renames) triggers re-reads; there is no polling loop.
 */
export async function waitForState(
  filePath: string,
  predicate: (state: LoomState) => boolean,
  timeoutMs: number,
): Promise<LoomState | null> {
  const dir = path.dirname(filePath);
  const name = path.basename(filePath);
  await fs.mkdir(dir, { recursive: true });

  return new Promise((resolve) => {
    let done = false;
    let checking = false;
    let recheck = false;
    let watcher: FSWatcher | null = null;

    const finish = (result: LoomState | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      watcher?.close();
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);

    const check = async (): Promise<void> => {
      if (done) return;
      if (checking) {
        recheck = true;
        return;
      }
      checking = true;
      const state = await readState(filePath);
      checking = false;
      if (predicate(state)) {
        finish(state);
        return;
      }
      if (recheck) {
        recheck = false;
        void check();
      }
    };

    watcher = watch(dir, (_event, fname) => {
      if (!fname || fname === name) void check();
    });
    // Cover the gap between the caller's write and the watcher attaching.
    void check();
  });
}

function safeName(name: string, fallback: string): string {
  return name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || fallback;
}

export async function writeCapture(
  cwd: string,
  pngBuffer: Buffer,
  name: string,
  sidecarConfig: unknown | null,
): Promise<string> {
  const dir = resolveCapturesDir(cwd);
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const base = `${safeName(name, 'loom')}-${stamp}`;
  const pngPath = path.join(dir, `${base}.png`);
  await fs.writeFile(pngPath, pngBuffer);
  if (sidecarConfig) {
    await fs.writeFile(path.join(dir, `${base}.json`), JSON.stringify(sidecarConfig, null, 2), 'utf8');
  }
  return pngPath;
}

/** Write the agent's see-frames; older requests' frames are pruned. */
export async function writeSeeFrames(cwd: string, requestId: string, frames: Buffer[]): Promise<string[]> {
  const dir = resolveSeeDir(cwd);
  await fs.mkdir(dir, { recursive: true });
  const existing = await fs.readdir(dir);
  await Promise.all(existing.map((f) => fs.rm(path.join(dir, f), { force: true })));
  const id = safeName(requestId, 'see');
  return Promise.all(
    frames.map(async (buf, i) => {
      const p = path.join(dir, `${id}-${i + 1}.jpg`);
      await fs.writeFile(p, buf);
      return p;
    }),
  );
}
