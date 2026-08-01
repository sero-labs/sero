import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../../shared/paths';
import type { AnimationRecord, AnimationStatus, CharacterRecord } from '../shared/character';
import { applySpriteRequest } from './requests';
import type { SpriteQueue } from './queue';
import { stagingDir } from './staging';
import { readAnimation, writeAnimation, writeCharacter } from './store';

/**
 * The two request handlers that stand between a person and a paid call.
 *
 * The request log is applied **at-least-once**. A crash between applying a
 * request and recording it replays that request, so every handler here has to
 * be safe to run twice — and "safe" means neither spending money again nor
 * deleting the files a review is still holding open.
 */

let paths: DesignLibraryPaths;
let home: string;
let queue: { build: ReturnType<typeof vi.fn>; propose: ReturnType<typeof vi.fn> };

const CHARACTER: CharacterRecord = {
  id: 'char1',
  name: 'Explorer',
  source: 'reference',
  status: 'approved',
  palette: ['#000000', '#ffffff'],
  cap: { kind: 'measured' },
  ramps: [],
  artHeight: 136,
  artWidth: 62,
  exportScale: 4,
  basePoseFile: 'characters/char1/base.png',
  root: { footRow: 135, centreCol: 31 },
  styleNotes: '',
  ingestion: {
    block: 8,
    lift: 8,
    sourceWidth: 496,
    sourceHeight: 1088,
    measuredColours: 2,
    residual: 0,
    backgroundRemoved: true,
  },
  createdAt: 0,
  updatedAt: 0,
};

function record(status: AnimationStatus, review?: AnimationRecord['review']): AnimationRecord {
  return {
    id: 'anim1',
    characterId: 'char1',
    plan: { name: 'rest', instruction: '', frameCount: 6, playRate: 30, loop: 'once' },
    status,
    canvas: { cols: 62, rows: 136 },
    anchor: { col: 31, row: 135 },
    frames: [],
    findings: [],
    report: null,
    history: [],
    createdAt: 0,
    updatedAt: 0,
    ...(review === undefined ? {} : { review }),
  };
}

const REVIEW = {
  stagingKey: 'frames-1',
  sampleCount: 40,
  sampleDurationsMs: Array.from({ length: 40 }, () => 83),
  proposed: [0, 10, 20],
  scale: 8,
  proposedAt: 0,
};

async function stage(key: string): Promise<void> {
  const dir = path.join(stagingDir(paths, key), '000');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, '0.part'), Buffer.from([1, 2, 3]));
}

function context() {
  return { paths, queue: queue as unknown as SpriteQueue, onError: () => {} };
}

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'sprite-requests-'));
  paths = designLibraryPathsFromHome(home);
  await writeCharacter(paths, CHARACTER);
  queue = { build: vi.fn(), propose: vi.fn() };
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('attaching the frames a second time', () => {
  it('does not delete the samples the review is holding', async () => {
    // The replayed request names the very key the proposal is built on. This
    // used to clear it, leaving a review whose frames had gone.
    await writeAnimation(paths, record('awaiting-review', REVIEW));
    await stage('frames-1');

    await applySpriteRequest(
      { kind: 'sprite.frames.attach', animationId: 'anim1', stagingKey: 'frames-1', durationsMs: [] },
      context(),
    );

    expect(existsSync(stagingDir(paths, 'frames-1'))).toBe(true);
    expect(queue.propose).not.toHaveBeenCalled();
  });

  it('still clears a key nothing is waiting on', async () => {
    await writeAnimation(paths, record('ready'));
    await stage('frames-orphan');

    await applySpriteRequest(
      {
        kind: 'sprite.frames.attach',
        animationId: 'anim1',
        stagingKey: 'frames-orphan',
        durationsMs: [],
      },
      context(),
    );

    expect(existsSync(stagingDir(paths, 'frames-orphan'))).toBe(false);
  });
});

describe('choosing the frames', () => {
  it('builds once, however many times the request arrives', async () => {
    // Two presses, or one press replayed. The status does not move until the
    // build job starts, so without a claim both would pass the guard — and a
    // second build is a second round of paid repairs on the same clip.
    await writeAnimation(paths, record('awaiting-review', REVIEW));
    const choose = { kind: 'sprite.frames.choose' as const, animationId: 'anim1', indices: [0, 5] };

    await applySpriteRequest(choose, context());
    await applySpriteRequest(choose, context());

    expect(queue.build).toHaveBeenCalledTimes(1);
    expect(queue.build).toHaveBeenCalledWith('char1', 'anim1', 'frames-1', REVIEW.sampleDurationsMs, [
      0, 5,
    ]);
  });

  it('refuses a set too small to be an animation, and builds nothing', async () => {
    await writeAnimation(paths, record('awaiting-review', REVIEW));

    await expect(
      applySpriteRequest(
        { kind: 'sprite.frames.choose', animationId: 'anim1', indices: [3] },
        context(),
      ),
    ).rejects.toThrow(/at least two frames/);
    expect(queue.build).not.toHaveBeenCalled();
    expect((await readAnimation(paths, 'char1', 'anim1'))?.status).toBe('awaiting-review');
  });

  it('drops indices the clip does not have', async () => {
    await writeAnimation(paths, record('awaiting-review', REVIEW));

    await applySpriteRequest(
      { kind: 'sprite.frames.choose', animationId: 'anim1', indices: [5, 999, -2, 1.5, 5, 0] },
      context(),
    );

    expect(queue.build).toHaveBeenCalledWith('char1', 'anim1', 'frames-1', expect.anything(), [0, 5]);
  });

  it('is ignored when no proposal is waiting', async () => {
    await writeAnimation(paths, record('ready'));

    await applySpriteRequest(
      { kind: 'sprite.frames.choose', animationId: 'anim1', indices: [0, 5] },
      context(),
    );

    expect(queue.build).not.toHaveBeenCalled();
  });
});
