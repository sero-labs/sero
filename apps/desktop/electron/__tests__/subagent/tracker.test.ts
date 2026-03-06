import { describe, it, expect, vi } from 'vitest';
import { SubagentTracker } from '../../subagent/tracker';
import type { SubagentEntry, SubagentUsage } from '../../subagent/types';

function makeEntry(overrides: Partial<SubagentEntry> = {}): SubagentEntry {
  return {
    id: 'run-1',
    agentName: 'scout',
    taskPreview: 'Scan the codebase',
    status: 'running',
    startedAt: Date.now(),
    completedAt: null,
    durationMs: null,
    parentSessionId: 'session-1',
    workspaceId: 'ws-1',
    mode: 'single',
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, cost: 0 },
    model: 'claude-sonnet-4-6',
    ...overrides,
  };
}

function makeUsage(overrides: Partial<SubagentUsage> = {}): SubagentUsage {
  return {
    inputTokens: 100,
    outputTokens: 200,
    cacheReadTokens: 50,
    cacheWriteTokens: 10,
    totalTokens: 360,
    cost: 0.01,
    ...overrides,
  };
}

describe('SubagentTracker', () => {
  it('start stores entry and emits event', () => {
    const tracker = new SubagentTracker();
    const handler = vi.fn();
    tracker.on('subagent_start', handler);

    const entry = makeEntry();
    tracker.start(entry);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'run-1', status: 'running' }));

    const snapshot = tracker.snapshot('ws-1');
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].id).toBe('run-1');
  });

  it('complete updates status, timing, response, and emits event', () => {
    const tracker = new SubagentTracker();
    const handler = vi.fn();
    tracker.on('subagent_end', handler);

    tracker.start(makeEntry());
    tracker.complete('run-1', 'Analysis complete: found 10 issues.', makeUsage());

    expect(handler).toHaveBeenCalledTimes(1);
    const emitted = handler.mock.calls[0][0];
    expect(emitted.status).toBe('completed');
    expect(emitted.durationMs).toBeGreaterThanOrEqual(0);
    expect(emitted.fullResponse).toBe('Analysis complete: found 10 issues.');
    expect(emitted.responsePreview).toBe('Analysis complete: found 10 issues.');
    expect(emitted.usage.totalTokens).toBe(360);
  });

  it('fail sets error and failed status', () => {
    const tracker = new SubagentTracker();
    const handler = vi.fn();
    tracker.on('subagent_end', handler);

    tracker.start(makeEntry());
    tracker.fail('run-1', 'API key invalid');

    const emitted = handler.mock.calls[0][0];
    expect(emitted.status).toBe('failed');
    expect(emitted.error).toBe('API key invalid');
  });

  it('abort sets aborted status', () => {
    const tracker = new SubagentTracker();
    const handler = vi.fn();
    tracker.on('subagent_end', handler);

    tracker.start(makeEntry());
    tracker.abort('run-1');

    const emitted = handler.mock.calls[0][0];
    expect(emitted.status).toBe('aborted');
  });

  it('timeout sets timed_out status', () => {
    const tracker = new SubagentTracker();
    const handler = vi.fn();
    tracker.on('subagent_end', handler);

    tracker.start(makeEntry());
    tracker.timeout('run-1');

    const emitted = handler.mock.calls[0][0];
    expect(emitted.status).toBe('timed_out');
    expect(emitted.error).toContain('timed out');
  });

  it('progress merges partial usage', () => {
    const tracker = new SubagentTracker();
    const handler = vi.fn();
    tracker.on('subagent_progress', handler);

    tracker.start(makeEntry());
    tracker.progress('run-1', { inputTokens: 50, outputTokens: 100 });

    expect(handler).toHaveBeenCalledWith('run-1', { inputTokens: 50, outputTokens: 100 });

    const entry = tracker.get('run-1');
    expect(entry?.usage.inputTokens).toBe(50);
    expect(entry?.usage.outputTokens).toBe(100);
  });

  it('snapshot filters by workspaceId', () => {
    const tracker = new SubagentTracker();
    tracker.start(makeEntry({ id: 'a', workspaceId: 'ws-1' }));
    tracker.start(makeEntry({ id: 'b', workspaceId: 'ws-2' }));
    tracker.start(makeEntry({ id: 'c', workspaceId: 'ws-1' }));

    const ws1 = tracker.snapshot('ws-1');
    expect(ws1).toHaveLength(2);
    expect(ws1.map((e) => e.id).sort()).toEqual(['a', 'c']);

    const ws2 = tracker.snapshot('ws-2');
    expect(ws2).toHaveLength(1);
    expect(ws2[0].id).toBe('b');
  });

  it('clear removes entries for a parentSessionId', () => {
    const tracker = new SubagentTracker();
    const handler = vi.fn();
    tracker.on('subagent_clear', handler);

    tracker.start(makeEntry({ id: 'a', parentSessionId: 's1' }));
    tracker.start(makeEntry({ id: 'b', parentSessionId: 's2' }));
    tracker.start(makeEntry({ id: 'c', parentSessionId: 's1' }));

    tracker.clear('s1');

    expect(handler).toHaveBeenCalledWith('s1');
    expect(tracker.snapshot('ws-1')).toHaveLength(1);
    expect(tracker.get('b')).toBeDefined();
    expect(tracker.get('a')).toBeUndefined();
  });
});
