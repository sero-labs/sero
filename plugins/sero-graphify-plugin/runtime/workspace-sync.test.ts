import { describe, expect, it, vi } from 'vitest';
import { syncWorkspaceList, sweepOrphanArtifacts } from './workspace-sync';
import type { IndexerHost } from './indexer';
import { DEFAULT_STATE, type GraphifyState } from '../shared/types';

function makeHost(workspaces: { id: string; name: string; path: string; open: boolean }[], seed?: (state: GraphifyState) => void) {
  let state = structuredClone(DEFAULT_STATE);
  seed?.(state);
  const host = {
    readState: async () => structuredClone(state),
    updateState: async (updater: (current: GraphifyState) => GraphifyState) => { state = updater(structuredClone(state)); },
    listWorkspaces: async () => workspaces,
    removeWorkspaceArtifacts: vi.fn().mockResolvedValue(undefined),
    listArtifactWorkspaceIds: vi.fn().mockResolvedValue(['ws1']),
    notify: vi.fn(),
    log: vi.fn(),
  } as unknown as IndexerHost;
  return { host, getState: () => state };
}

describe('an unreadable workspace list is not a deletion', () => {
  it('keeps entries when the list comes back empty', async () => {
    // The host registry loader falls back to an empty list when
    // workspaces.json cannot be read. Acting on that would drop every entry.
    const { host, getState } = makeHost([], (state) => {
      state.workspaces.ws1 = {
        workspaceId: 'ws1', name: 'One', path: '/p/one', enabled: true,
        status: 'idle', lastBuiltAt: 'yesterday',
      };
    });
    const result = await syncWorkspaceList(host);
    expect(result.removedIds).toEqual([]);
    expect(getState().workspaces.ws1).toBeDefined();
    expect(host.removeWorkspaceArtifacts).not.toHaveBeenCalled();
  });

  it('keeps graph artifacts when the list comes back empty', async () => {
    const { host } = makeHost([]);
    await sweepOrphanArtifacts(host);
    expect(host.removeWorkspaceArtifacts).not.toHaveBeenCalled();
  });

  it('still removes a genuinely deleted workspace', async () => {
    const { host, getState } = makeHost([{ id: 'ws2', name: 'Two', path: '/p/two', open: true }], (state) => {
      state.workspaces.ws1 = {
        workspaceId: 'ws1', name: 'One', path: '/p/one', enabled: true,
        status: 'idle', lastBuiltAt: 'yesterday',
      };
    });
    const result = await syncWorkspaceList(host);
    expect(result.removedIds).toEqual(['ws1']);
    expect(getState().workspaces.ws1).toBeUndefined();
    expect(getState().removedWorkspaces.map((entry) => entry.workspaceId)).toEqual(['ws1']);
  });
});
