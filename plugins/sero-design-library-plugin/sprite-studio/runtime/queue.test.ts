import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../../shared/paths';
import { updateState } from '../../shared/state-io';
import type { DesignLibraryState } from '../../shared/types';
import { SpriteQueue } from './queue';

/**
 * Cancelling, and the counting behind it.
 *
 * Everything in this queue costs money or minutes, so "stop" has to actually
 * stop — including the second job for something that already has one running.
 * Runs used to be held by animation id, which meant a repair started while
 * another was running replaced it in the map: the first became unabortable,
 * the second's entry was deleted by whichever finished first, and the
 * concurrency cap counted one where there were two.
 */

let paths: DesignLibraryPaths;
let home: string;
let queue: SpriteQueue;
/** Resolvers for the jobs currently parked, so a test decides when they end. */
let parked: (() => void)[];
let started: { characterId: string; signal: AbortSignal }[];

/** A queue whose only job is to sit still until the test lets it go. */
function parkingQueue(): SpriteQueue {
  const made = new SpriteQueue({
    host: {} as never,
    paths,
    workspaceId: 'w',
    sessionId: 's',
    onError: () => {},
    onChanged: async () => {},
  });
  // The work itself is not what is under test; the bookkeeping around it is.
  const inner = made as unknown as {
    execute(job: { characterId?: string }, signal: AbortSignal): Promise<void>;
  };
  inner.execute = async (job, signal) => {
    started.push({ characterId: job.characterId ?? '', signal });
    await new Promise<void>((resolve) => parked.push(resolve));
  };
  return made;
}

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'sprite-queue-'));
  paths = designLibraryPathsFromHome(home);
  parked = [];
  started = [];
  queue = parkingQueue();
});

afterEach(async () => {
  for (const release of parked) release();
  await queue.dispose();
  await rm(home, { recursive: true, force: true });
});

/** Let the queue's own promises settle. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10));

describe('cancelling a character', () => {
  it('reaches every job it owns, including two for one animation', async () => {
    queue.fix('char1', 'anim1', 'again');
    queue.fix('char1', 'anim1', 'and again');
    queue.animate('char1', 'anim2');
    await settle();

    expect(started.length).toBe(3);
    queue.cancelCharacter('char1');

    // All three, not just the last one recorded against the animation.
    expect(started.every((run) => run.signal.aborted)).toBe(true);
  });

  it('leaves another character\'s work alone', async () => {
    queue.animate('char1', 'anim1');
    queue.animate('char2', 'anim2');
    await settle();

    queue.cancelCharacter('char1');

    expect(started[0]?.signal.aborted).toBe(true);
    expect(started[1]?.signal.aborted).toBe(false);
  });

  it('takes queued work out before it ever starts', async () => {
    // Three at once is the default, so the fourth is still waiting.
    queue.animate('char1', 'a');
    queue.animate('char1', 'b');
    queue.animate('char1', 'c');
    queue.animate('char1', 'd');
    await settle();
    expect(started.length).toBe(3);

    queue.cancelCharacter('char1');
    for (const release of parked) release();
    await settle();

    // The fourth was dropped rather than started once a slot came free.
    expect(started.length).toBe(3);
  });
});

describe('how many run at once', () => {
  it('counts two jobs for one animation as two', async () => {
    // With runs held by animation id these three shared one entry, so the cap
    // never applied and a fourth started immediately.
    queue.fix('char1', 'anim1', 'one');
    queue.fix('char1', 'anim1', 'two');
    queue.fix('char1', 'anim1', 'three');
    queue.fix('char1', 'anim1', 'four');
    await settle();

    expect(started.length).toBe(3);
  });

  it('falls back to the default when the stored setting is nonsense', async () => {
    // `NaN` would make `running.size < limit` false for ever, which is a queue
    // that silently never runs anything again.
    await updateState(paths, (current: DesignLibraryState) => ({
      ...current,
      sprite: {
        ...current.sprite,
        settings: { ...current.sprite.settings, concurrency: Number.NaN },
      },
    }));

    queue.animate('char1', 'anim1');
    await settle();

    expect(started.length).toBe(1);
  });
});
