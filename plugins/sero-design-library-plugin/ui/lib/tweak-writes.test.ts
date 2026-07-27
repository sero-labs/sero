import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TweakWriter, mergeOverrides, revertFailed, unacknowledged } from './tweak-writes';

/**
 * The write path is all about timing, so these are all about timing: a drag
 * coalescing, a value landing on the revision it was set on rather than the one
 * on screen when the timer fires, and a checkpoint that never overtakes the
 * values it is meant to close over.
 */

const DELAY = 250;

const FIRST = { designId: 'dsn-1', variantId: 'var-1', revisionId: 'rev-1' };
const SECOND = { designId: 'dsn-1', variantId: 'var-2', revisionId: 'rev-9' };

let sent: Array<Record<string, unknown>>;
let resolvers: Array<() => void>;

/** Records what was asked for, and holds each request open until released. */
function send(params: Record<string, unknown>): Promise<unknown> {
  sent.push(params);
  return new Promise<void>((resolve) => resolvers.push(resolve));
}

/** Let every in-flight request finish, and give the chain a turn to advance. */
async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    for (const resolve of resolvers.splice(0)) resolve();
    await Promise.resolve();
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  sent = [];
  resolvers = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('queuing tweak values', () => {
  it('coalesces a drag into one write per control', async () => {
    const writer = new TweakWriter(DELAY);
    for (const value of [6, 8, 10, 12]) writer.queue(send, FIRST, 'gap', value);

    expect(sent).toEqual([]);
    vi.advanceTimersByTime(DELAY);
    await settle();

    expect(sent).toEqual([
      { action: 'set-tweak', value: '12', ...FIRST, controlId: 'gap' },
    ]);
  });

  it('writes each control it touched', async () => {
    const writer = new TweakWriter(DELAY);
    writer.queue(send, FIRST, 'gap', 12);
    writer.queue(send, FIRST, 'accent', '#16805f');
    vi.advanceTimersByTime(DELAY);
    await settle();

    expect(sent.map((entry) => entry.controlId)).toEqual(['gap', 'accent']);
  });

  it('sends a reset as a reset, not as a value', async () => {
    const writer = new TweakWriter(DELAY);
    writer.queue(send, FIRST, 'gap', null);
    vi.advanceTimersByTime(DELAY);
    await settle();

    expect(sent[0]).toEqual({ action: 'reset-tweak', ...FIRST, controlId: 'gap' });
  });

  it('sends a waiting value to the revision it was set on, not the one now open', async () => {
    // The bug this exists for: set a value, switch variant within the debounce,
    // and the write retunes the page the user has just moved to.
    const writer = new TweakWriter(DELAY);
    writer.queue(send, FIRST, 'gap', 12);
    writer.queue(send, SECOND, 'gap', 30);
    await settle();

    expect(sent[0]).toMatchObject({ ...FIRST, value: '12' });

    vi.advanceTimersByTime(DELAY);
    await settle();
    expect(sent[1]).toMatchObject({ ...SECOND, value: '30' });
  });

  it('flushes what is waiting when the panel goes away', async () => {
    const writer = new TweakWriter(DELAY);
    writer.queue(send, FIRST, 'gap', 12);
    void writer.flush(send);
    await settle();

    expect(sent).toHaveLength(1);
    // And the batch is gone, so the timer firing later writes nothing twice.
    vi.advanceTimersByTime(DELAY);
    await settle();
    expect(sent).toHaveLength(1);
  });

  it('drops what is waiting when a caller asks for it to be thrown away', async () => {
    const writer = new TweakWriter(DELAY);
    writer.queue(send, FIRST, 'gap', 12);
    writer.discard();
    void writer.send(send, { action: 'reset-tweaks', ...FIRST });
    vi.advanceTimersByTime(DELAY);
    await settle();

    expect(sent).toEqual([{ action: 'reset-tweaks', ...FIRST }]);
  });

  it('writes a waiting value before the action that replaces it', async () => {
    // Reset all checkpoints what it clears. A value still in the debounce would
    // otherwise be missing from the entry the user has to undo back to.
    const writer = new TweakWriter(DELAY);
    writer.queue(send, FIRST, 'gap', 20);
    void writer.flush(send);
    void writer.send(send, { action: 'reset-tweaks', ...FIRST });
    await settle();

    expect(sent.map((entry) => entry.action)).toEqual(['set-tweak', 'reset-tweaks']);
  });
});

describe('ordering', () => {
  it('sends a checkpoint after the values it closes over', async () => {
    // A checkpoint that overtook the last change would record the editing
    // session without it — the one thing a checkpoint must never do.
    const writer = new TweakWriter(DELAY);
    writer.queue(send, FIRST, 'gap', 12);
    void writer.flush(send);
    void writer.send(send, { action: 'checkpoint-tweaks', ...FIRST });
    await settle();

    expect(sent.map((entry) => entry.action)).toEqual(['set-tweak', 'checkpoint-tweaks']);
  });

  it('tells the queued write, and only that one, when its request failed', async () => {
    // The callback belongs to the value that was sent. A later change to the
    // same control replaces it outright, so a slow failure can never take back
    // a value the user set afterwards.
    const writer = new TweakWriter(DELAY);
    const failing = () => Promise.reject(new Error('gone'));
    const first = vi.fn();
    const second = vi.fn();

    writer.queue(failing, FIRST, 'gap', 12, first);
    writer.queue(failing, FIRST, 'gap', 20, second);
    vi.advanceTimersByTime(DELAY);
    await settle();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('says nothing to a write that succeeded', async () => {
    const writer = new TweakWriter(DELAY);
    const onFailure = vi.fn();
    writer.queue(send, FIRST, 'gap', 12, onFailure);
    vi.advanceTimersByTime(DELAY);
    await settle();

    expect(onFailure).not.toHaveBeenCalled();
  });

  it('keeps writing after a request fails', async () => {
    // A rejected `.then` is skipped by every `.then` after it, so without a
    // settled tail one failed write would silently stop this writer for the rest
    // of the session — every later value and every checkpoint lost in silence.
    const writer = new TweakWriter(DELAY);
    const failing = () => Promise.reject(new Error('the runtime is gone'));

    const rejected = writer.send(failing, { action: 'set-tweak', controlId: 'gap', ...FIRST });
    await expect(rejected).rejects.toThrow('the runtime is gone');

    void writer.send(send, { action: 'checkpoint-tweaks', ...FIRST });
    await settle();

    expect(sent).toEqual([{ action: 'checkpoint-tweaks', ...FIRST }]);
  });

  it('holds each request until the one before it has landed', async () => {
    const writer = new TweakWriter(DELAY);
    void writer.send(send, { action: 'set-tweak', controlId: 'a', ...FIRST });
    void writer.send(send, { action: 'set-tweak', controlId: 'b', ...FIRST });
    await Promise.resolve();

    // The second has not been asked for yet: the first is still open.
    expect(sent).toHaveLength(1);
    await settle();
    expect(sent.map((entry) => entry.controlId)).toEqual(['a', 'b']);
  });
});

describe('the local overlay', () => {
  it('shows a value before it has been written, and a reset as absent', () => {
    expect(mergeOverrides({ gap: 12 }, { gap: 20 })).toEqual({ gap: 20 });
    expect(mergeOverrides({ gap: 12 }, { gap: null })).toEqual({});
  });

  it('keeps only what the runtime has not caught up with', () => {
    // Kept: not yet stored, or stored as something else.
    expect(unacknowledged({ gap: 20, accent: '#000000' }, { gap: 12 })).toEqual({
      gap: 20,
      accent: '#000000',
    });
    // Dropped once it agrees — otherwise the overlay masks the next change made
    // anywhere else, including one the runtime refused.
    expect(unacknowledged({ gap: 20 }, { gap: 20 })).toEqual({});
    expect(unacknowledged({ gap: null }, {})).toEqual({});
    expect(unacknowledged({ gap: null }, { gap: 12 })).toEqual({ gap: null });
  });

  it('is the same object when nothing was acknowledged, so state does not churn', () => {
    const pending = { gap: 20 };
    expect(unacknowledged(pending, { gap: 12 })).toBe(pending);
  });
});

describe('a write that failed', () => {
  const key = 'dsn-1/var-1/rev-1';

  it('takes back the value it could not save', () => {
    expect(
      revertFailed({ key, values: { gap: 20 } }, { key, controlId: 'gap', attempted: '20' }),
    ).toEqual({ key, values: {} });
  });

  it('leaves a newer value alone', () => {
    // A slow failure must not undo the value that replaced it — the user would
    // watch a correct value disappear for a write they no longer care about.
    const pending = { key, values: { gap: 30 } };
    expect(revertFailed(pending, { key, controlId: 'gap', attempted: '20' })).toBe(pending);
  });

  it('leaves the revision the user has moved to alone', () => {
    const pending = { key: 'dsn-1/var-2/rev-9', values: { gap: 20 } };
    expect(revertFailed(pending, { key, controlId: 'gap', attempted: '20' })).toBe(pending);
  });

  it('takes back a failed reset, which is not the same as a failed value', () => {
    expect(
      revertFailed({ key, values: { gap: null } }, { key, controlId: 'gap', attempted: null }),
    ).toEqual({ key, values: {} });
    const pending = { key, values: { gap: null } };
    expect(revertFailed(pending, { key, controlId: 'gap', attempted: '20' })).toBe(pending);
  });
});
