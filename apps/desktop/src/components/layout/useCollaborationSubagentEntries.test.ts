import { describe, expect, it } from 'vitest';
import type { SubagentEntry } from '@/types/ipc';
import { buildLatestActiveEntriesByRole } from './useCollaborationSubagentEntries';

function createEntry(
  overrides: Partial<SubagentEntry>,
): SubagentEntry {
  return {
    id: 'entry-1',
    agentName: 'researcher',
    taskPreview: 'Investigate',
    status: 'running',
    startedAt: 1,
    completedAt: null,
    durationMs: null,
    parentSessionId: 'session-1',
    workspaceId: 'workspace-1',
    mode: 'single',
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      cost: 0,
    },
    model: null,
    toolActivity: [],
    liveOutput: '',
    ...overrides,
  };
}

describe('buildLatestActiveEntriesByRole', () => {
  it('ignores terminal entries from previous collaboration runs', () => {
    const latest = buildLatestActiveEntriesByRole([
      createEntry({
        id: 'old-researcher',
        agentName: 'researcher',
        status: 'completed',
        startedAt: 10,
        completedAt: 20,
        durationMs: 10,
        liveOutput: 'stale output',
      }),
      createEntry({
        id: 'running-analyst',
        agentName: 'collab-analyst',
        status: 'running',
        startedAt: 30,
        liveOutput: 'fresh output',
      }),
    ]);

    expect(latest.has('researcher')).toBe(false);
    expect(latest.get('analyst')?.id).toBe('running-analyst');
  });

  it('prefers running entries over queued ones for the same role', () => {
    const latest = buildLatestActiveEntriesByRole([
      createEntry({
        id: 'queued-researcher',
        agentName: 'researcher',
        status: 'queued',
        startedAt: 40,
      }),
      createEntry({
        id: 'running-researcher',
        agentName: 'researcher',
        status: 'running',
        startedAt: 20,
        liveOutput: 'live',
      }),
    ]);

    expect(latest.get('researcher')?.id).toBe('running-researcher');
  });
});
