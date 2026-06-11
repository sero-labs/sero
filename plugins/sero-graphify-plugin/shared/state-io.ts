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
  const current = (await readStateFile(stateFile)) ?? structuredClone(DEFAULT_STATE);
  const id = current.nextRequestId;
  const next: GraphifyState = {
    ...current,
    nextRequestId: id + 1,
    requests: [...current.requests, { id, action, workspaceId, requestedAt: new Date().toISOString() }],
  };
  await writeStateFile(stateFile, next);
  return id;
}
