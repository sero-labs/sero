import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createToolStallWatch } from '@electron/features/subagent/runtime/abort-grace';

describe('the stall watch and a tool that makes calls of its own', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does not stall a script that runs longer than the period while its calls make progress', () => {
    const onStall = vi.fn();
    const watch = createToolStallWatch(100, onStall);

    watch.start('script', 'codemode');
    for (const id of ['script/1', 'script/2', 'script/3']) {
      watch.start(id, 'bash', 'script');
      vi.advanceTimersByTime(60);
      watch.end(id);
    }

    expect(onStall).not.toHaveBeenCalled();
  });

  it('stalls the call that stopped making progress', () => {
    const onStall = vi.fn();
    const watch = createToolStallWatch(100, onStall);

    watch.start('script', 'codemode');
    watch.start('script/1', 'bash', 'script');
    vi.advanceTimersByTime(100);

    expect(onStall).toHaveBeenCalledWith('bash');
  });
});
