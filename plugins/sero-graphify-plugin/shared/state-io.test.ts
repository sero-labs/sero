import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readStateFile, appendIndexRequest, appendIndexRequests } from './state-io';
import { DEFAULT_STATE } from './types';

describe('state-io', () => {
  it('returns null for missing state', async () => {
    expect(await readStateFile('/nonexistent/state.json')).toBeNull();
  });

  it('appends requests atomically with incrementing ids', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'graphify-state-'));
    const stateFile = path.join(dir, 'state.json');
    const first = await appendIndexRequest(stateFile, 'enable', 'ws1');
    const second = await appendIndexRequest(stateFile, 'rebuild', 'ws1');
    expect(first).toBe(1);
    expect(second).toBe(2);
    const state = JSON.parse(await readFile(stateFile, 'utf8'));
    expect(state.requests).toHaveLength(2);
    expect(state.settings).toEqual(DEFAULT_STATE.settings);
  });

  it('appends related requests in one batch', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'graphify-state-batch-'));
    const stateFile = path.join(dir, 'state.json');
    const ids = await appendIndexRequests(stateFile, [
      { action: 'sync' },
      { action: 'enable', workspaceId: 'ws1' },
    ]);

    expect(ids).toEqual([1, 2]);
    const state = await readStateFile(stateFile);
    expect(state?.requests.map(({ action, workspaceId }) => ({ action, workspaceId }))).toEqual([
      { action: 'sync', workspaceId: undefined },
      { action: 'enable', workspaceId: 'ws1' },
    ]);
  });
});
