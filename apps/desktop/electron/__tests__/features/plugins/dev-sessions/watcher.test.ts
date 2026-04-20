import { EventEmitter } from 'events';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeWatcher extends EventEmitter {
  close = vi.fn();
}

const mocks = vi.hoisted(() => ({
  watch: vi.fn(),
  existsSync: vi.fn(() => true),
}));

vi.mock('fs', () => ({
  default: {
    watch: mocks.watch,
    existsSync: mocks.existsSync,
  },
  watch: mocks.watch,
  existsSync: mocks.existsSync,
}));

import { PluginDevSessionWatcher } from '@electron/features/plugins/dev-sessions/watcher';

describe('PluginDevSessionWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.watch.mockReset();
    mocks.existsSync.mockReset();
    mocks.existsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces recursive file changes into one refresh request', async () => {
    const fakeWatcher = new FakeWatcher();
    mocks.watch.mockReturnValue(fakeWatcher);
    const onRefreshRequested = vi.fn();
    const watcher = new PluginDevSessionWatcher(onRefreshRequested);

    watcher.watch('dev_1', '/tmp/plugin-one');

    expect(mocks.watch).toHaveBeenCalledWith(
      path.resolve('/tmp/plugin-one'),
      { recursive: true },
      expect.any(Function),
    );

    const changeListener = mocks.watch.mock.calls[0]?.[2] as (() => void);
    changeListener();
    changeListener();

    await vi.advanceTimersByTimeAsync(249);
    expect(onRefreshRequested).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onRefreshRequested).toHaveBeenCalledTimes(1);
    expect(onRefreshRequested).toHaveBeenCalledWith('dev_1');
  });
});
