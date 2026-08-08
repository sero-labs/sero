import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_STATE, type GraphifyState, type IndexAction } from './types';

export async function readStateFile(stateFile: string): Promise<GraphifyState | null> {
  try {
    return JSON.parse(await readFile(stateFile, 'utf8')) as GraphifyState;
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

/** Append related requests in one state write so the runtime observes them together. */
export async function appendIndexRequests(
  stateFile: string,
  requests: Array<{ action: IndexAction; workspaceId?: string }>,
): Promise<number[]> {
  const current = (await readStateFile(stateFile)) ?? structuredClone(DEFAULT_STATE);
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
