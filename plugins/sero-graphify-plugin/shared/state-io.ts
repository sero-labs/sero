import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { withStateLock } from '@sero-ai/extension-runtime';
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
  // that would erase workspace and request state over a half-written read.
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

/**
 * Append related requests in one state write so the runtime observes them
 * together.
 *
 * This runs in the extension process, while the runtime writes the same file
 * from the main process — builds write progress every 750ms, so a plain
 * read-modify-write would routinely revert what the runtime wrote since the
 * read (a `lastBuiltAt`, the applied-request watermark). The read and the
 * write therefore happen under the cross-process lock the host's
 * AppStateManager takes for every mutation of this file.
 */
export async function appendIndexRequests(
  stateFile: string,
  requests: Array<Omit<IndexRequest, 'id' | 'requestedAt'>>,
): Promise<number[]> {
  return withStateLock(stateFile, async () => {
    const raw = await readRaw(stateFile);
    const current = raw === null ? withStateDefaults(null) : parseOrThrow(raw, stateFile);
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
    await writeStateFile(stateFile, next);
    return queued.map((request) => request.id);
  });
}
