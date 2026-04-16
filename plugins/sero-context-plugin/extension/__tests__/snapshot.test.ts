import { describe, expect, it } from 'vitest';
import type {
  ExtensionContext,
  SessionEntry,
  SessionManager,
} from '@mariozechner/pi-coding-agent';
import { resolveTargetId } from '../helpers';
import { buildSnapshot } from '../snapshot';

function createEntry(entry: SessionEntry): SessionEntry {
  return entry;
}

describe('context helpers', () => {
  it('resolves root IDs, commit-like IDs, and tag labels consistently', () => {
    const rootEntry = createEntry({
      id: 'root',
      type: 'message',
      parentId: null,
      timestamp: new Date().toISOString(),
      message: {
        role: 'user',
        content: 'Root',
      },
    } as SessionEntry);
    const childEntry = createEntry({
      id: 'child',
      type: 'message',
      parentId: 'root',
      timestamp: new Date().toISOString(),
      message: {
        role: 'user',
        content: 'Child',
      },
    } as SessionEntry);

    const sessionManager = {
      getTree: () => [
        {
          entry: rootEntry,
          children: [
            {
              entry: childEntry,
              children: [],
            },
          ],
        },
      ],
      getLabel: (id: string) => (id === 'child' ? 'release' : undefined),
    } as Pick<SessionManager, 'getTree' | 'getLabel'> as SessionManager;

    expect(resolveTargetId(sessionManager, 'root')).toBe('root');
    expect(resolveTargetId(sessionManager, 'deadbeef')).toBe('deadbeef');
    expect(resolveTargetId(sessionManager, 'release')).toBe('child');
    expect(resolveTargetId(sessionManager, 'missing')).toBe('missing');
  });
});

describe('buildSnapshot', () => {
  it('preserves hidden-node counts, nearest-tag distance, and usage breakdown', async () => {
    const root = createEntry({
      id: 'root',
      type: 'message',
      message: {
        role: 'user',
        content: 'Start here',
      },
    } as SessionEntry);
    const assistant = createEntry({
      id: 'assistant',
      type: 'message',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Investigating' },
          { type: 'toolCall', name: 'search', args: '{}' },
        ],
      },
    } as SessionEntry);
    const leaf = createEntry({
      id: 'leaf',
      type: 'message',
      message: {
        role: 'user',
        content: 'Continue',
      },
    } as SessionEntry);
    const summary = createEntry({
      id: 'summary',
      type: 'branch_summary',
      summary: 'Off-path summary',
    } as SessionEntry);

    const childrenById = new Map<string, SessionEntry[]>([
      ['root', [summary]],
      ['assistant', []],
      ['leaf', []],
      ['summary', []],
    ]);
    const labels = new Map<string, string>([['root', 'baseline']]);

    const sessionManager = {
      getBranch: () => [root, assistant, leaf],
      getLeafId: () => 'leaf',
      getChildren: (id: string) => childrenById.get(id) ?? [],
      getLabel: (id: string) => labels.get(id),
    } as Pick<SessionManager, 'getBranch' | 'getLeafId' | 'getChildren' | 'getLabel'> as SessionManager;

    const context = {
      getContextUsage: () => ({
        tokens: 120,
        contextWindow: 1000,
        percent: 12,
      }),
      getSystemPrompt: () => 'System prompt',
    } as Pick<ExtensionContext, 'getContextUsage' | 'getSystemPrompt'> as ExtensionContext;

    const snapshot = await buildSnapshot(sessionManager, context, {
      getActiveTools: () => ['search'],
      getAllTools: () => [{ name: 'search', schema: {} }],
    });

    expect(snapshot.nodes.map((node) => node.id)).toEqual(['root', 'summary', 'leaf']);
    expect(snapshot.nodes.map((node) => node.hiddenBefore)).toEqual([0, 0, 1]);
    expect(snapshot.nearestTag).toBe('baseline');
    expect(snapshot.stepsSinceTag).toBe(2);
    expect(snapshot.totalEntries).toBe(3);
    expect(snapshot.usage).toMatchObject({
      tokens: 120,
      contextWindow: 1000,
      percent: 12,
    });
    expect(snapshot.usage?.breakdown.toolCalls).toBeGreaterThan(0);
  });
});
