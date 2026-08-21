/** Shared harness for the indexer suites. */
import { vi } from 'vitest';
import { GraphifyIndexer, type IndexerHost } from './indexer';
import { DEFAULT_STATE, type GraphifyState, type WorkspaceIndexStats } from '../shared/types';

export const STATS: WorkspaceIndexStats = { nodes: 10, edges: 20, communities: 2, inputTokens: 0, outputTokens: 0 };

interface HostOptions {
  /** Workspace ids whose graph is already on disk. */
  built?: string[];
  overrides?: Partial<IndexerHost>;
}

export function makeHost(options: HostOptions = {}, seed?: (state: GraphifyState) => void) {
  let state: GraphifyState = structuredClone(DEFAULT_STATE);
  seed?.(state);
  const built = new Set(options.built ?? []);
  const host: IndexerHost = {
    readState: async () => structuredClone(state),
    updateState: async (updater) => { state = updater(structuredClone(state)); },
    listWorkspaces: async () => [
      { id: 'ws1', name: 'One', path: '/p/one', open: true },
      { id: 'ws2', name: 'Two', path: '/p/two', open: false },
    ],
    ensureProvisioned: vi.fn().mockResolvedValue(undefined),
    graphExists: async (id) => built.has(id),
    graphifyVersion: async () => '0.9.47',
    upgradeGraphify: vi.fn().mockResolvedValue(undefined),
    confirm: vi.fn().mockResolvedValue(true),
    notify: vi.fn(),
    buildGraph: vi.fn().mockImplementation(async (
      workspace: { workspaceId: string },
    ) => {
      built.add(workspace.workspaceId);
      return { stats: STATS, usageMeasured: false };
    }),
    updateGraph: vi.fn().mockResolvedValue({ stats: STATS, usageMeasured: false }),
    mergeProfileGraph: vi.fn().mockResolvedValue({ nodes: 20, edges: 40 }),
    removeWorkspaceArtifacts: vi.fn().mockResolvedValue(undefined),
    listArtifactWorkspaceIds: vi.fn().mockResolvedValue([]),
    log: () => {},
    ...options.overrides,
  };
  return { host, getState: () => state };
}

export function request(id: number, action: string, workspaceId?: string) {
  return { id, action, workspaceId, requestedAt: 'now' } as GraphifyState['requests'][number];
}

/**
 * Queue a request the way the extension does — into the state file — then hand
 * the runtime the resulting snapshot. The indexer drains from stored state, not
 * from the delivered object, which is what makes a repeated delivery harmless.
 */
export async function deliver(
  indexer: GraphifyIndexer,
  host: IndexerHost,
  ...requests: GraphifyState['requests']
): Promise<GraphifyState> {
  await host.updateState((state) => ({ ...state, requests: [...state.requests, ...requests] }));
  const snapshot = (await host.readState())!;
  await indexer.handleStateChange(snapshot);
  return snapshot;
}

export function enabled(state: GraphifyState, id: string, patch: Partial<GraphifyState['workspaces'][string]> = {}) {
  state.workspaces[id] = {
    workspaceId: id, name: id === 'ws1' ? 'One' : 'Two', path: `/p/${id}`,
    enabled: true, status: 'idle', ...patch,
  };
}
