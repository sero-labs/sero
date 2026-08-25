import { beforeEach, describe, expect, it, vi } from 'vitest';
import { persistLayout } from '@/lib/persist-layout';
import { useNodesStore } from './nodes';
import { useSessionStore } from './sessions';

vi.mock('@/lib/persist-layout', () => ({ persistLayout: vi.fn() }));

describe('local session selection with Agent Nodes', () => {
  beforeEach(() => {
    vi.mocked(persistLayout).mockClear();
    useNodesStore.setState({ activeLocationKey: 'node:spark:remote' });
    useSessionStore.setState({ sessions: [], activeSessionId: null });
    Object.defineProperty(window, 'sero', { configurable: true, value: { sessions: {
      create: vi.fn().mockResolvedValue({
        path: '/sessions/local.jsonl', id: 'local', cwd: '/repo', workspaceId: 'repo',
        created: '2026-01-01T00:00:00Z', modified: '2026-01-01T00:00:00Z',
        messageCount: 0, firstMessage: '',
      }),
    } } });
  });

  it('keeps a newly created local session selected instead of showing the prior remote session', async () => {
    await useSessionStore.getState().createSession('repo');
    expect(useSessionStore.getState().activeSessionId).toBe('local');
    expect(useNodesStore.getState().activeLocationKey).toBeNull();
    expect(persistLayout).toHaveBeenCalledWith({
      activeSessionId: 'local', activeSessionLocationKey: 'local:local',
    });
  });
});
