import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { withStateDefaults, type GraphifyState, type IndexAction, type IndexRequest, type SettingsPatch } from './types';

/** Distinguishes "no state yet" from "state exists but could not be read". */
class UnreadableStateError extends Error {}

async function readRaw(stateFile: string): Promise<string | null> {
  try {
    return await readFile(stateFile, 'utf8');
  } catch {
    // Genuinely absent, or unreadable — either way there is nothing to preserve.
    return null;
  }
}

function parseOrThrow(raw: string, stateFile: string): GraphifyState {
  // A file that exists but does not parse must NOT be replaced with defaults:
  // that would erase the model choice, the caps and the spend ledger over a
  // half-written read.
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'null') return withStateDefaults(null);
  try {
    return withStateDefaults(JSON.parse(trimmed) as GraphifyState);
  } catch {
    throw new UnreadableStateError(`Graphify state at ${stateFile} could not be parsed; refusing to overwrite it.`);
  }
}

export async function readStateFile(stateFile: string): Promise<GraphifyState | null> {
  const raw = await readRaw(stateFile);
  if (raw === null) return null;
  try {
    return parseOrThrow(raw, stateFile);
  } catch {
    return null;
  }
}

export async function writeStateFile(stateFile: string, state: GraphifyState): Promise<void> {
  await mkdir(path.dirname(stateFile), { recursive: true });
  const temp = `${stateFile}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(state, null, 2), 'utf8');
  await rename(temp, stateFile);
}

export async function appendIndexRequest(stateFile: string, action: IndexAction, workspaceId?: string): Promise<number> {
  return (await appendIndexRequests(stateFile, [{ action, workspaceId }]))[0];
}

/** Queue a settings change for the runtime to merge. See SettingsPatch. */
export async function appendSettingsRequest(stateFile: string, settings: SettingsPatch): Promise<number> {
  return (await appendIndexRequests(stateFile, [{ action: 'settings', settings }]))[0];
}

/** How many times to retry when the runtime wrote the file mid-append. */
const MAX_APPEND_ATTEMPTS = 8;

/**
 * Write `next` only if the file still holds exactly `expected`.
 *
 * Returns false when it changed, so the caller can re-read and rebuild its
 * update on top of the newer content instead of reverting it.
 *
 * This narrows the window; it is not a lock. The runtime writes this file from
 * the main process through its own serialised queue and takes nothing this
 * process holds, so a write landing between the check and the rename is still
 * possible in principle — the gap is now a single rename rather than a read,
 * parse and rebuild. Closing it completely needs one shared write path for both
 * processes.
 */
export async function writeIfUnchanged(
  stateFile: string,
  expected: string | null,
  next: GraphifyState,
): Promise<boolean> {
  if ((await readRaw(stateFile)) !== expected) return false;
  await writeStateFile(stateFile, next);
  return true;
}

/**
 * Append related requests in one state write so the runtime observes them
 * together.
 *
 * This runs in the extension process, while the runtime writes the same file
 * through the host's serialised queue — the two share no lock. A plain
 * read-modify-write would therefore revert everything the runtime wrote since
 * this read: a spend-ledger entry, a `lastBuiltAt`, or the applied-request
 * watermark (which would resurrect drained requests and re-queue a paid
 * rebuild). Builds write progress every 750ms, so that window is hit routinely.
 *
 * Instead the file is re-read and compared byte-for-byte immediately before the
 * write, and the whole append is retried when it changed. Writes are atomic
 * renames, so a match means nothing landed in between.
 */
export async function appendIndexRequests(
  stateFile: string,
  requests: Array<Omit<IndexRequest, 'id' | 'requestedAt'>>,
): Promise<number[]> {
  for (let attempt = 0; attempt < MAX_APPEND_ATTEMPTS; attempt += 1) {
    const before = await readRaw(stateFile);
    const current = before === null ? withStateDefaults(null) : parseOrThrow(before, stateFile);
    const requestedAt = new Date().toISOString();
    const queued = requests.map((request, index) => ({
      id: current.nextRequestId + index,
      ...request,
      requestedAt,
    }));
    const next: GraphifyState = {
      ...current,
      nextRequestId: current.nextRequestId + queued.length,
      requests: [...current.requests, ...queued],
    };

    if (!(await writeIfUnchanged(stateFile, before, next))) continue;
    return queued.map((request) => request.id);
  }
  throw new Error('Graphify state is being written too often to queue this request. Try again in a moment.');
}
