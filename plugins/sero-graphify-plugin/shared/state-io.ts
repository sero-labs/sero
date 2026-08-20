import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { withStateDefaults, type GraphifyState, type IndexAction, type IndexRequest, type SettingsPatch } from './types';

export async function readStateFile(stateFile: string): Promise<GraphifyState | null> {
  try {
    return withStateDefaults(JSON.parse(await readFile(stateFile, 'utf8')) as GraphifyState);
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

/** Append related requests in one state write so the runtime observes them together. */
export async function appendIndexRequests(
  stateFile: string,
  requests: Array<Omit<IndexRequest, 'id' | 'requestedAt'>>,
): Promise<number[]> {
  const current = withStateDefaults(await readStateFile(stateFile));
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
}
