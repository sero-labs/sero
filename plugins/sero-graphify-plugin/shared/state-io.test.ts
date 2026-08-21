import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readStateFile, appendIndexRequest, appendIndexRequests, writeStateFile, writeIfUnchanged } from './state-io';
import { DEFAULT_STATE, withStateDefaults, type GraphifyState } from './types';

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

describe('withStateDefaults', () => {
  it('migrates paid-build state to local indexing settings', () => {
    const legacy = {
      settings: { backend: 'claude', model: 'legacy', tokenBudget: 60000, exclude: ['vendor'] },
      spend: { day: '2026-08-20', usd: 4.2, runs: [] },
    } as unknown as GraphifyState;
    const state = withStateDefaults(legacy);
    expect(state.settings.exclude).toEqual(['vendor']);
    expect(state.settings.paused).toBe(false);
    expect(state.settings).toHaveProperty('model', 'legacy');
    expect(state).toHaveProperty('spend.usd', 4.2);
    expect(state.removedWorkspaces).toEqual([]);
  });

  it('keeps current local settings', () => {
    const state = withStateDefaults({
      settings: { ...structuredClone(DEFAULT_STATE.settings), paused: true, exclude: ['dist'] },
    } as unknown as GraphifyState);
    expect(state.settings).toMatchObject({ paused: true, exclude: ['dist'] });
  });

  it('returns defaults for a missing file', () => {
    expect(withStateDefaults(null)).toEqual(DEFAULT_STATE);
  });
});

describe('appendIndexRequests concurrency', () => {
  it('refuses to write over content that changed since it was read', async () => {
    // The extension and the runtime write this file from different processes
    // with no shared lock. Without the check, an append would revert whatever
    // the runtime wrote in between, including the applied request watermark.
    const dir = await mkdtemp(path.join(os.tmpdir(), 'graphify-race-'));
    const stateFile = path.join(dir, 'state.json');
    const stale = JSON.stringify(structuredClone(DEFAULT_STATE), null, 2);

    const runtimeWrote = {
      ...structuredClone(DEFAULT_STATE),
      provisioning: { status: 'ready' as const, updatedAt: '2026-08-20' },
    };
    await writeStateFile(stateFile, runtimeWrote);

    const wrote = await writeIfUnchanged(stateFile, stale, structuredClone(DEFAULT_STATE));
    expect(wrote).toBe(false);
    expect((await readStateFile(stateFile))?.provisioning.updatedAt).toBe('2026-08-20');
  });

  it('writes when the content is untouched', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'graphify-race-'));
    const stateFile = path.join(dir, 'state.json');
    await writeStateFile(stateFile, structuredClone(DEFAULT_STATE));
    const current = await readFile(stateFile, 'utf8');

    const wrote = await writeIfUnchanged(stateFile, current, { ...structuredClone(DEFAULT_STATE), nextRequestId: 9 });
    expect(wrote).toBe(true);
    expect((await readStateFile(stateFile))?.nextRequestId).toBe(9);
  });

  it('refuses to overwrite a state file it cannot parse', async () => {
    // Replacing an unreadable file with defaults would erase runtime state.
    const dir = await mkdtemp(path.join(os.tmpdir(), 'graphify-corrupt-'));
    const stateFile = path.join(dir, 'state.json');
    await writeFile(stateFile, '{"settings":', 'utf8');
    await expect(appendIndexRequest(stateFile, 'sync')).rejects.toThrow(/could not be parsed/);
    expect(await readFile(stateFile, 'utf8')).toBe('{"settings":');
  });
});
