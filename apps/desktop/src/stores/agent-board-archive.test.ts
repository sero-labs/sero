// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentBoardStore } from './agent-board';
import { persistLayout } from '@/lib/persist-layout';

vi.mock('@/lib/persist-layout', () => ({ persistLayout: vi.fn() }));

const card = {
  kind: 'issue' as const,
  key: 'ws:issue:555',
  workspaceId: 'ws',
  workspaceName: 'Sero',
  issue: {
    number: 555, title: 'Archive tasks', url: 'https://github.com/sero-labs/sero/issues/555',
    labels: [], assignees: [], updatedAt: '2026-09-24T00:00:00Z',
  },
};

describe('Agent Board archive state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAgentBoardStore.setState({ archived: [], deletedKeys: [], restoredKeys: [] });
  });

  it('persists the card snapshot and restores it without deleting its source', () => {
    const store = useAgentBoardStore.getState();
    store.archiveCard(card);
    expect(useAgentBoardStore.getState().archived[0]).toMatchObject({
      key: card.key, title: '#555 Archive tasks', kind: 'issue', workspaceId: 'ws',
    });
    expect(vi.mocked(persistLayout)).toHaveBeenCalledWith(expect.objectContaining({
      boardLayout: expect.objectContaining({ archived: expect.arrayContaining([
        expect.objectContaining({ key: card.key }),
      ]) }),
    }));
    store.restoreCard(card.key);
    expect(useAgentBoardStore.getState().archived).toEqual([]);
    expect(useAgentBoardStore.getState().deletedKeys).toEqual([]);
  });

  it('retains a deletion tombstone across hydration so a refreshed issue stays hidden', () => {
    const store = useAgentBoardStore.getState();
    store.archiveCard(card);
    store.deleteArchived(card.key);
    const { archived, deletedKeys, restoredKeys } = useAgentBoardStore.getState();
    expect(archived).toEqual([]);
    expect(deletedKeys).toEqual([card.key]);
    store.hydrate({ archived, deletedKeys, restoredKeys });
    expect(useAgentBoardStore.getState().deletedKeys).toContain(card.key);
    store.archiveCard(card);
    expect(useAgentBoardStore.getState().deletedKeys).toContain(card.key);
    expect(useAgentBoardStore.getState().archived).toEqual([]);
  });

  it('pins a restored card so it can re-enter a full Finished column', () => {
    const store = useAgentBoardStore.getState();
    store.archiveCard(card);
    store.restoreCard(card.key);
    expect(useAgentBoardStore.getState().restoredKeys).toContain(card.key);
    expect(vi.mocked(persistLayout)).toHaveBeenLastCalledWith(expect.objectContaining({
      boardLayout: expect.objectContaining({ restoredKeys: [card.key], archived: [] }),
    }));
  });
});
