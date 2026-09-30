/**
 * Live watch routing for the subagent bridge.
 *
 * Live text and tool activity must reach only the windows that show the run,
 * and each run must keep its own update rate.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@/types/ipc-channels';
import type { SubagentEntry } from '@/types/subagent';
import type { SubagentTracker as SubagentTrackerType } from '@electron/features/subagent/core/tracker';

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown;

interface FakeWindow {
  webContents: { id: number; send: ReturnType<typeof vi.fn> };
  isDestroyed: () => boolean;
}

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, IpcHandler>(),
  windows: [] as FakeWindow[],
  tracker: undefined as unknown as SubagentTrackerType,
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: IpcHandler) => {
      mocks.handlers.set(channel, handler);
    },
  },
  BrowserWindow: {
    getAllWindows: () => mocks.windows,
  },
}));

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: '/tmp/sero-agent',
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  subagentManager: {
    get tracker() {
      return mocks.tracker;
    },
    listAgents: async () => [],
    snapshot: () => [],
    abortOne: () => {},
    clearCompleted: () => {},
  },
}));

import { SubagentTracker } from '@electron/features/subagent/core/tracker';
import { SubagentWatchRegistry, PerRunThrottle } from '@electron/ipc/subagent/live-watch';

function makeWindow(id: number): FakeWindow {
  return {
    webContents: { id, send: vi.fn() },
    isDestroyed: () => false,
  };
}

function makeSender(id: number) {
  return { id, once: vi.fn(), on: vi.fn() };
}

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
    toolActivity: [],
    liveOutput: '',
    ...overrides,
  };
}

function handler(channel: string): IpcHandler {
  const found = mocks.handlers.get(channel);
  if (!found) throw new Error(`No handler registered for ${channel}`);
  return found;
}

/** Live output events sent to one window. */
function liveEventsFor(index: number): Array<{ type: string; id?: string; text?: string }> {
  return mocks.windows[index].webContents.send.mock.calls
    .filter((call) => call[0] === IpcChannels.subagent.event)
    .map((call) => call[1] as { type: string; id?: string; text?: string })
    .filter((event) => event.type === 'subagent_live_output');
}

async function watch(windowIndex: number, runId: string, sender = makeSender(windowIndex + 1)): Promise<void> {
  await handler(IpcChannels.subagent.watch)({ sender }, runId);
}

let registerSubagentHandlers: () => void;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  mocks.handlers.clear();
  mocks.windows = [makeWindow(1), makeWindow(2)];
  mocks.tracker = new SubagentTracker();
  ({ registerSubagentHandlers } = await import('@electron/ipc/subagent/subagent'));
  registerSubagentHandlers();
});

describe('subagent live watch routing', () => {
  it('sends live text only to the window that watches the run', async () => {
    mocks.tracker.start(makeEntry());
    await watch(0, 'run-1');

    mocks.tracker.appendLiveOutput('run-1', 'reading files');

    const watched = liveEventsFor(0);
    expect(watched).toHaveLength(1);
    expect(watched[0].text).toBe('reading files');

    expect(liveEventsFor(1)).toHaveLength(0);
  });

  it('shows where the run is now when a watch opens', async () => {
    mocks.tracker.start(makeEntry());
    mocks.tracker.appendLiveOutput('run-1', 'missed text');
    mocks.tracker.updateToolActivity('run-1', 'edit', 'src/App.tsx', true);

    await watch(0, 'run-1');

    const live = liveEventsFor(0);
    expect(live).toHaveLength(1);
    expect(live[0].text).toBe('missed text');

    const activity = mocks.windows[0].webContents.send.mock.calls
      .map((call) => call[1] as { type: string; activity?: Array<{ toolName: string }> })
      .filter((event) => event.type === 'subagent_tool_activity');
    expect(activity).toHaveLength(1);
    expect(activity[0].activity?.[0].toolName).toBe('edit');
  });

  it('stops sending for a run after its watch closes', async () => {
    mocks.tracker.start(makeEntry());
    await watch(0, 'run-1');
    await handler(IpcChannels.subagent.unwatch)({ sender: makeSender(1) }, 'run-1');

    mocks.tracker.appendLiveOutput('run-1', 'after close');

    expect(liveEventsFor(0)).toHaveLength(0);
  });

  it('counts repeated watches per window, so one block closing keeps the other fed', async () => {
    mocks.tracker.start(makeEntry());
    await watch(0, 'run-1');
    await watch(0, 'run-1');

    await handler(IpcChannels.subagent.unwatch)({ sender: makeSender(1) }, 'run-1');
    mocks.tracker.appendLiveOutput('run-1', 'still visible');

    expect(liveEventsFor(0).some((event) => event.text === 'still visible')).toBe(true);
  });

  it('drops a window’s watches when the window is destroyed', async () => {
    mocks.tracker.start(makeEntry());
    const sender = makeSender(1);
    await watch(0, 'run-1', sender);

    const onDestroyed = sender.once.mock.calls.find((call) => call[0] === 'destroyed')?.[1] as
      | (() => void)
      | undefined;
    expect(onDestroyed).toBeTypeOf('function');

    mocks.tracker.appendLiveOutput('run-1', 'before destroy');
    mocks.windows[0].webContents.send.mockClear();

    onDestroyed!();
    mocks.tracker.appendLiveOutput('run-1', 'after destroy');

    expect(liveEventsFor(0)).toHaveLength(0);
  });

  it('broadcasts start and end to every window for an unwatched run', () => {
    mocks.tracker.start(makeEntry({ id: 'run-9' }));
    mocks.tracker.complete('run-9', 'done', {
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, cost: 0,
    });

    for (const window of mocks.windows) {
      const types = window.webContents.send.mock.calls
        .filter((call) => call[0] === IpcChannels.subagent.event)
        .map((call) => (call[1] as { type: string }).type);
      expect(types).toContain('subagent_start');
      expect(types).toContain('subagent_end');
    }
  });

  it('keeps a separate update rate for each run', async () => {
    mocks.tracker.start(makeEntry({ id: 'run-1' }));
    mocks.tracker.start(makeEntry({ id: 'run-2' }));
    await watch(0, 'run-1');
    await watch(0, 'run-2');

    // First frame of each run goes out at once.
    mocks.tracker.appendLiveOutput('run-1', 'a1');
    mocks.tracker.appendLiveOutput('run-2', 'b1');
    mocks.tracker.appendLiveOutput('run-1', 'a2');
    mocks.tracker.appendLiveOutput('run-2', 'b2');

    const firstRound = liveEventsFor(0);
    expect(firstRound.map((event) => event.text).sort()).toEqual(['a1', 'b1']);

    vi.advanceTimersByTime(200);

    // Both runs deliver their held frame; neither starves the other.
    // Each payload is the whole capped tail, so nothing is lost.
    const texts = liveEventsFor(0).map((event) => event.text);
    expect(texts).toContain('a1a2');
    expect(texts).toContain('b1b2');
  });

  it('drops a held frame when the run ends', async () => {
    mocks.tracker.start(makeEntry({ id: 'run-1' }));
    await watch(0, 'run-1');

    mocks.tracker.appendLiveOutput('run-1', 'a1');
    mocks.tracker.appendLiveOutput('run-1', 'a2');
    mocks.tracker.complete('run-1', 'done', {
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, cost: 0,
    });

    mocks.windows[0].webContents.send.mockClear();
    vi.advanceTimersByTime(1000);

    expect(liveEventsFor(0)).toHaveLength(0);
  });
});

describe('SubagentWatchRegistry', () => {
  it('keeps one count per window and run', () => {
    const registry = new SubagentWatchRegistry();
    registry.watch(1, 'run-a');
    registry.watch(1, 'run-a');
    registry.watch(2, 'run-a');

    registry.unwatch(1, 'run-a');
    expect(registry.watchers('run-a').sort()).toEqual([1, 2]);

    registry.unwatch(1, 'run-a');
    expect(registry.watchers('run-a')).toEqual([2]);
  });

  it('drops a run for every window and a window for every run', () => {
    const registry = new SubagentWatchRegistry();
    registry.watch(1, 'run-a');
    registry.watch(1, 'run-b');
    registry.watch(2, 'run-a');

    registry.dropRun('run-a');
    expect(registry.watchers('run-a')).toEqual([]);
    expect(registry.isWatched('run-b')).toBe(true);

    registry.dropWindow(1);
    expect(registry.isWatched('run-b')).toBe(false);
  });
});

describe('PerRunThrottle', () => {
  it('sends the first payload at once and holds the next', () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const throttle = new PerRunThrottle<string>(flush, 200);

    throttle.push('run-a', 'one');
    throttle.push('run-a', 'two');
    throttle.push('run-b', 'other');

    expect(flush.mock.calls).toEqual([['run-a', 'one'], ['run-b', 'other']]);

    vi.advanceTimersByTime(200);
    expect(flush.mock.calls).toContainEqual(['run-a', 'two']);
  });

  it('forgets held work on clear', () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const throttle = new PerRunThrottle<string>(flush, 200);

    throttle.push('run-a', 'one');
    throttle.push('run-a', 'two');
    throttle.clear('run-a');
    vi.advanceTimersByTime(1000);

    expect(flush).toHaveBeenCalledTimes(1);
  });
});
