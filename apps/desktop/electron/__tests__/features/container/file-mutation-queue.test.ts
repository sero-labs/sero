import { describe, expect, it } from 'vitest';

import { withFileMutationQueue } from '@electron/features/container/filesystem/file-mutation-queue';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function delay(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('withFileMutationQueue', () => {
  it('runs mutations to one key in sequence', async () => {
    const order: string[] = [];
    const gate = deferred();

    const first = withFileMutationQueue('host:/a', async () => {
      order.push('first:start');
      await gate.promise;
      order.push('first:end');
    });
    const second = withFileMutationQueue('host:/a', async () => {
      order.push('second');
    });

    await delay();
    expect(order).toEqual(['first:start']);

    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(['first:start', 'first:end', 'second']);
  });

  it('does not block mutations to different keys', async () => {
    const order: string[] = [];
    const gate = deferred();

    const slow = withFileMutationQueue('host:/a', async () => {
      order.push('slow:start');
      await gate.promise;
      order.push('slow:end');
    });
    const fast = withFileMutationQueue('host:/b', async () => {
      order.push('fast');
    });

    await fast;
    expect(order).toContain('fast');
    gate.resolve();
    await slow;
  });

  it('allows nested acquisition of one key without deadlock and releases after the outermost call', async () => {
    const order: string[] = [];

    await withFileMutationQueue('host:/a', async () => {
      order.push('outer:start');
      await withFileMutationQueue('host:/a', async () => {
        order.push('inner');
      });
      order.push('outer:end');
    });

    expect(order).toEqual(['outer:start', 'inner', 'outer:end']);

    // The lock is free again: the next mutation does not wait on the outer one.
    await withFileMutationQueue('host:/a', async () => {
      order.push('after');
    });
    expect(order).toEqual(['outer:start', 'inner', 'outer:end', 'after']);
  });

  it('releases the key after a rejected mutation', async () => {
    await expect(withFileMutationQueue('host:/a', async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');

    await expect(withFileMutationQueue('host:/a', async () => 'ok')).resolves.toBe('ok');
  });
});
