import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@electron/ipc/lib/window-broadcast', () => ({ broadcastToWindows: () => {} }));
vi.mock('@sero-ai/extension-runtime', () => ({
  stateLockPath: (filePath: string) => `${filePath}.lock`,
  withLock: async (_path: string, task: () => Promise<unknown>) => task(),
}));

import { AppStateManager } from '@electron/features/apps/state/manager';

describe('change reads that finish out of order', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('push only the newest data and etag pair', async () => {
    vi.useFakeTimers();
    const manager = new AppStateManager();
    const pushed: Array<{ data: unknown; etag: string | null }> = [];
    manager.onFileChange((_filePath, data, etag) => pushed.push({ data, etag }));

    // Two reads: the first is slow and finishes after the second.
    const reads = [
      new Promise<{ data: unknown; etag: string | null }>((resolve) =>
        setTimeout(() => resolve({ data: { v: 1 }, etag: 'e1' }), 500)),
      Promise.resolve({ data: { v: 2 }, etag: 'e2' }),
    ];
    vi.spyOn(manager, 'readWithEtag').mockImplementation(() => reads.shift()!);
    // The watcher entry the change handler needs, without touching disk.
    (manager as unknown as { watchers: Map<string, unknown> }).watchers.set('/state.json', {
      watcher: null, refCount: 1, debounceTimer: null, readSeq: 0,
      initializing: false, cancelled: false, setupPromise: null,
    });
    const handle = (manager as unknown as { handleFileChange: (p: string) => void }).handleFileChange
      .bind(manager);

    handle('/state.json');
    await vi.advanceTimersByTimeAsync(60);
    handle('/state.json');
    await vi.advanceTimersByTimeAsync(600);

    expect(pushed).toEqual([{ data: { v: 2 }, etag: 'e2' }]);
  });
});
