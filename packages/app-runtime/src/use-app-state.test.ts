import { describe, expect, it, vi } from 'vitest';

import type { AppStateWriteResult } from './sero-bridge';
import { applyDefaultState, writeStateWithRebase } from './use-app-state';

interface DemoState {
  name: string;
  count: number;
  tags: string[];
  nested: { open: boolean };
  optional?: { from: string };
}

const DEFAULT_STATE: DemoState = {
  name: '',
  count: 0,
  tags: [],
  nested: { open: false },
};

describe('applyDefaultState', () => {
  it('takes the file’s values over the defaults', () => {
    expect(applyDefaultState(DEFAULT_STATE, {
      name: 'repo',
      count: 3,
      tags: ['a'],
      nested: { open: true },
    })).toEqual({ name: 'repo', count: 3, tags: ['a'], nested: { open: true } });
  });

  it('keeps the default where the file disagrees about the type', () => {
    const merged = applyDefaultState(DEFAULT_STATE, { name: 42, tags: 'nope' });
    expect(merged.name).toBe('');
    expect(merged.tags).toEqual([]);
  });

  it('fills in what the file leaves out', () => {
    expect(applyDefaultState(DEFAULT_STATE, { name: 'repo' }).count).toBe(0);
  });

  // An `undefined` default says the field is optional, not that it must be
  // absent. Enforcing it dropped the file's value on every read, which is how
  // a whole feature's state could be written correctly and never arrive.
  it('passes optional fields through when the default is undefined', () => {
    const withOptional: DemoState = { ...DEFAULT_STATE, optional: undefined };

    expect(applyDefaultState(withOptional, {
      name: 'repo',
      optional: { from: 'the file' },
    }).optional).toEqual({ from: 'the file' });
  });

  it('leaves an absent optional field absent', () => {
    const withOptional: DemoState = { ...DEFAULT_STATE, optional: undefined };
    expect(applyDefaultState(withOptional, { name: 'repo' }).optional).toBeUndefined();
  });
});

describe('writeStateWithRebase', () => {
  type S = { status: string; count: number };
  const rebase = (fileData: unknown) => applyDefaultState({ status: '', count: 0 }, fileData);

  it('writes once when the etag still matches', async () => {
    const write = vi.fn(async (): Promise<AppStateWriteResult> => ({ ok: true, etag: 'e1' }));

    const result = await writeStateWithRebase<S>(
      write,
      (prev) => ({ ...prev, count: prev.count + 1 }),
      { state: { status: 'a', count: 1 }, etag: 'e0' },
      rebase,
    );

    expect(result).toEqual({ state: { status: 'a', count: 1 }, etag: 'e1' });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith({ status: 'a', count: 1 }, 'e0');
  });

  // The core #428 property: a write based on a stale snapshot must land ON TOP
  // of the other writer's content, not replace it.
  it('re-applies the updater on top of newer content when rejected', async () => {
    const write = vi.fn()
      .mockResolvedValueOnce({ ok: false, data: { status: 'runtime-wrote-this', count: 7 }, etag: 'e1' })
      .mockResolvedValueOnce({ ok: true, etag: 'e2' });

    const result = await writeStateWithRebase<S>(
      write,
      (prev) => ({ ...prev, count: prev.count + 1 }),
      { state: { status: 'stale', count: 1 }, etag: 'e0' },
      rebase,
    );

    expect(result).toEqual({ state: { status: 'runtime-wrote-this', count: 8 }, etag: 'e2' });
    expect(write).toHaveBeenNthCalledWith(2, { status: 'runtime-wrote-this', count: 8 }, 'e1');
  });

  it('gives up after bounded attempts when the file keeps changing', async () => {
    let round = 0;
    const write = vi.fn(async (): Promise<AppStateWriteResult> => {
      round += 1;
      return { ok: false, data: { status: `round-${round}`, count: round }, etag: `e${round}` };
    });

    const result = await writeStateWithRebase<S>(
      write,
      (prev) => ({ ...prev, count: prev.count + 1 }),
      { state: { status: 'a', count: 1 }, etag: 'e0' },
      rebase,
    );

    expect(result).toBeNull();
    expect(write).toHaveBeenCalledTimes(5);
  });

  it('stops without writing again when newer content already satisfies the update', async () => {
    const write = vi.fn()
      .mockResolvedValueOnce({ ok: false, data: { status: 'done', count: 3 }, etag: 'e1' });

    const result = await writeStateWithRebase<S>(
      write,
      // Identity once the goal state is reached — models toggles that
      // another writer already applied.
      (prev) => (prev.status === 'done' ? prev : { ...prev, status: 'done' }),
      { state: { status: 'done', count: 0 }, etag: 'e0' },
      rebase,
    );

    expect(result).toEqual({ state: { status: 'done', count: 3 }, etag: 'e1' });
    expect(write).toHaveBeenCalledTimes(1);
  });
});
