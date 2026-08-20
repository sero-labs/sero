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
  it('fills in caps and the ledger for state written before they existed', () => {
    const legacy = { settings: { backend: 'claude', model: '', tokenBudget: 0, exclude: [] } } as unknown as GraphifyState;
    const state = withStateDefaults(legacy);
    expect(state.settings.caps.maxCostPerDayUsd).toBe(DEFAULT_STATE.settings.caps.maxCostPerDayUsd);
    expect(state.spend).toEqual({ day: '', usd: 0, runs: [] });
    expect(state.removedWorkspaces).toEqual([]);
  });

  it('does not treat a legacy model string as a chosen model', () => {
    // `model: ''` meant "let graphify decide". Carrying it forward as a choice
    // would resume spending on a default nobody picked.
    const legacy = { settings: { model: '' } } as unknown as GraphifyState;
    expect(withStateDefaults(legacy).settings.model).toBeNull();
  });

  it('keeps a real model choice', () => {
    const chosen = { backend: 'openai' as const, modelId: 'gpt-5.6-luna', chosenAt: 'now' };
    const state = withStateDefaults({ settings: { model: chosen } } as unknown as GraphifyState);
    expect(state.settings.model).toEqual(chosen);
  });

  it('returns defaults for a missing file', () => {
    expect(withStateDefaults(null)).toEqual(DEFAULT_STATE);
  });
});

describe('appendIndexRequests concurrency', () => {
  it('refuses to write over content that changed since it was read', async () => {
    // The extension and the runtime write this file from different processes
    // with no shared lock. Without the check, an append would revert whatever
    // the runtime wrote in between — a spend-ledger entry, or the applied
    // request watermark, which would resurrect drained requests.
    const dir = await mkdtemp(path.join(os.tmpdir(), 'graphify-race-'));
    const stateFile = path.join(dir, 'state.json');
    const stale = JSON.stringify(structuredClone(DEFAULT_STATE), null, 2);

    const runtimeWrote = { ...structuredClone(DEFAULT_STATE), spend: { day: '2026-08-20', usd: 4.2, runs: [] } };
    await writeStateFile(stateFile, runtimeWrote);

    const wrote = await writeIfUnchanged(stateFile, stale, structuredClone(DEFAULT_STATE));
    expect(wrote).toBe(false);
    expect((await readStateFile(stateFile))?.spend.usd).toBe(4.2);
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
    // Replacing an unreadable file with defaults would erase the model choice,
    // the caps and the ledger over a half-written read.
    const dir = await mkdtemp(path.join(os.tmpdir(), 'graphify-corrupt-'));
    const stateFile = path.join(dir, 'state.json');
    await writeFile(stateFile, '{"settings":', 'utf8');
    await expect(appendIndexRequest(stateFile, 'sync')).rejects.toThrow(/could not be parsed/);
    expect(await readFile(stateFile, 'utf8')).toBe('{"settings":');
  });
});
