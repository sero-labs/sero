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

import {
  classifyPluginDevSessionPath,
  PluginDevSessionWatcher,
  shouldRefreshPluginDevSessionPath,
} from '@electron/features/plugins/dev-sessions/watcher';

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

    const changeListener = mocks.watch.mock.calls[0]?.[2] as (eventType: string, filename: string) => void;
    changeListener('change', 'package.json');
    changeListener('change', 'extension/index.ts');

    await vi.advanceTimersByTimeAsync(249);
    expect(onRefreshRequested).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onRefreshRequested).toHaveBeenCalledTimes(1);
    expect(onRefreshRequested).toHaveBeenCalledWith('dev_1');
  });

  it('debounces UI changes into a lightweight UI refresh request', async () => {
    const fakeWatcher = new FakeWatcher();
    mocks.watch.mockReturnValue(fakeWatcher);
    const onRefreshRequested = vi.fn();
    const onUiChangeRequested = vi.fn();
    const watcher = new PluginDevSessionWatcher(onRefreshRequested, onUiChangeRequested);

    watcher.watch('dev_1', '/tmp/plugin-one');

    const changeListener = mocks.watch.mock.calls[0]?.[2] as (eventType: string, filename: string) => void;
    changeListener('change', 'ui/SignalDeskApp.tsx');
    changeListener('change', 'ui/styles.css');
    changeListener('change', 'dist/ui/remoteEntry.js');
    changeListener('change', 'node_modules/.vite/deps/react.js');

    await vi.advanceTimersByTimeAsync(249);
    expect(onRefreshRequested).not.toHaveBeenCalled();
    expect(onUiChangeRequested).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onRefreshRequested).not.toHaveBeenCalled();
    expect(onUiChangeRequested).toHaveBeenCalledTimes(1);
    expect(onUiChangeRequested).toHaveBeenCalledWith('dev_1');
  });
});

describe('plugin dev session watch path classification', () => {
  it.each([
    'package.json',
    'extension/index.ts',
    'runtime/index.ts',
    'shared/types.ts',
    'prompts/example.md',
    'skills/SKILL.md',
  ])('refreshes for manifest and non-UI plugin files: %s', (filename) => {
    expect(shouldRefreshPluginDevSessionPath(filename)).toBe(true);
  });

  it.each([
    'ui/App.tsx',
    'ui/styles.css',
    'dist/ui/remoteEntry.js',
    'node_modules/.vite/deps/react.js',
    '.DS_Store',
  ])('does not trigger a full resource refresh for UI/generated files: %s', (filename) => {
    expect(shouldRefreshPluginDevSessionPath(filename)).toBe(false);
  });

  it('classifies UI source changes separately from ignored generated files', () => {
    expect(classifyPluginDevSessionPath('ui/App.tsx')).toBe('ui');
    expect(classifyPluginDevSessionPath('dist/ui/remoteEntry.js')).toBe('ignore');
  });

  it('refreshes conservatively when fs.watch omits a filename', () => {
    expect(shouldRefreshPluginDevSessionPath(null)).toBe(true);
  });
});
