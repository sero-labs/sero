import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../../shared/paths';
import { readState } from '../../shared/state-io';
import type { AnimationRecord, AnimationStatus, CharacterRecord } from '../shared/character';
import { samplesDir } from '../shared/paths';
import { recoverUnfinishedAnimations } from './recover';
import {
  heldStagingKeys,
  openNextReview,
  openReviewWhenBatchLands,
  releaseSamples,
  reviewIsOpen,
  settleReview,
  sweepOrphanSamples,
} from './review';
import { stagingDir } from './staging';
import { readAnimation, writeAnimation, writeCharacter } from './store';

/**
 * What holds a review open, and what ends it.
 *
 * This is the fault this feature area produces over and over: one side
 * depending on something the other quietly deleted, or declaring something the
 * other never acts on. A review is the worst case of it — a resting state whose
 * files nothing is currently working on — so both halves are tested here.
 */

let paths: DesignLibraryPaths;
let home: string;

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

function animation(
  id: string,
  status: AnimationStatus,
  extra: Partial<AnimationRecord> = {},
): AnimationRecord {
  return {
    id,
    characterId: 'char1',
    plan: { name: id, instruction: '', frameCount: 6, playRate: 30, loop: 'once' },
    status,
    canvas: { cols: 62, rows: 136 },
    anchor: { col: 31, row: 135 },
    frames: [],
    findings: [],
    report: null,
    history: [],
    createdAt: Number(id.replace(/\D/g, '') || 0),
    updatedAt: 0,
    ...extra,
  };
}

function waiting(id: string, stagingKey: string, batchId?: string): AnimationRecord {
  return animation(id, 'awaiting-review', {
    ...(batchId === undefined ? {} : { batchId }),
    review: {
      stagingKey,
      sampleCount: 61,
      sampleDurationsMs: Array.from({ length: 61 }, () => 83),
      proposed: [0, 10, 20],
      scale: 8,
      proposedAt: 0,
    },
  });
}

/** Staged bytes and a preview, as an open review really has on disk. */
async function putFilesOnDisk(id: string, stagingKey: string): Promise<void> {
  const staged = path.join(stagingDir(paths, stagingKey), '000');
  await mkdir(staged, { recursive: true });
  await writeFile(path.join(staged, '0.part'), Buffer.from([1, 2, 3]));
  const previews = samplesDir(paths, 'char1', id);
  await mkdir(previews, { recursive: true });
  await writeFile(path.join(previews, '000.png'), Buffer.from([1, 2, 3]));
}

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'sprite-review-'));
  paths = designLibraryPathsFromHome(home);
  await writeCharacter(paths, CHARACTER);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('what keeps a review alive', () => {
  it('names the staged samples of an open review, so housekeeping spares them', async () => {
    // An animation at the review has no pending request — it is waiting on a
    // person — so without this its samples are swept an hour after the clip
    // arrived and the review can never be finished.
    await writeAnimation(paths, waiting('a1', 'frames-a'));
    await writeAnimation(paths, animation('a2', 'ready'));

    expect(await heldStagingKeys(paths)).toEqual(['frames-a']);
  });

  it('holds nothing for an animation that has moved on', async () => {
    await writeAnimation(paths, animation('a3', 'compiling', { review: undefined }));
    expect(await heldStagingKeys(paths)).toEqual([]);
  });

  it('survives a restart, because nothing was running when the app closed', async () => {
    await writeAnimation(paths, waiting('a4', 'frames-d'));

    expect(await recoverUnfinishedAnimations(paths)).toEqual({ resumed: 0, failed: 0 });

    const after = await readAnimation(paths, 'char1', 'a4');
    expect(after?.status).toBe('awaiting-review');
    expect(after?.review?.stagingKey).toBe('frames-d');
  });
});

describe('previews nothing names any more', () => {
  it('sweeps the ones a settled review left behind', async () => {
    // Settling clears the record pointer first and the files second, so an
    // interruption between the two leaves previews inside the animation's own
    // directory, where the staging sweep does not look.
    await writeAnimation(paths, animation('d1', 'ready'));
    await putFilesOnDisk('d1', 'frames-x');

    expect(await sweepOrphanSamples(paths)).toBe(1);
    expect(existsSync(samplesDir(paths, 'char1', 'd1'))).toBe(false);
  });

  it('leaves an open review\'s previews exactly where they are', async () => {
    await writeAnimation(paths, waiting('d2', 'frames-y'));
    await putFilesOnDisk('d2', 'frames-y');

    expect(await sweepOrphanSamples(paths)).toBe(0);
    expect(existsSync(samplesDir(paths, 'char1', 'd2'))).toBe(true);
  });
});

describe('settling a review', () => {
  it('takes the samples, the previews and the proposal together', async () => {
    await writeAnimation(paths, waiting('b1', 'frames-b'));
    await putFilesOnDisk('b1', 'frames-b');

    await settleReview(paths, (await readAnimation(paths, 'char1', 'b1'))!);

    // Either all three go or none does. A record still pointing at samples that
    // have gone is a review nobody can finish.
    expect(existsSync(stagingDir(paths, 'frames-b'))).toBe(false);
    expect(existsSync(samplesDir(paths, 'char1', 'b1'))).toBe(false);
    expect((await readAnimation(paths, 'char1', 'b1'))?.review).toBeUndefined();
  });

  it('changes nothing on an animation that never had a review', async () => {
    await writeAnimation(paths, animation('b2', 'ready'));
    await settleReview(paths, (await readAnimation(paths, 'char1', 'b2'))!);
    expect((await readAnimation(paths, 'char1', 'b2'))?.status).toBe('ready');
  });

  it('releases the staged samples for a record that is about to be deleted', async () => {
    // The staged samples live outside the animation's own directory, so
    // deleting the directory alone would leave ten megabytes behind.
    await writeAnimation(paths, waiting('b3', 'frames-c'));
    await putFilesOnDisk('b3', 'frames-c');

    await releaseSamples(paths, (await readAnimation(paths, 'char1', 'b3'))!);

    expect(existsSync(stagingDir(paths, 'frames-c'))).toBe(false);
  });
});

describe('when a batch opens its review', () => {
  it('waits for the last animation of the batch to land', async () => {
    await writeAnimation(paths, waiting('c1', 'k1', 'batch'));
    await writeAnimation(paths, animation('c2', 'generating', { batchId: 'batch' }));

    const opened = await openReviewWhenBatchLands(
      paths,
      (await readAnimation(paths, 'char1', 'c1'))!,
    );

    expect(opened).toBe(false);
    expect((await readState(paths)).sprite.openAnimationId).toBeUndefined();
  });

  it('opens the earliest one waiting, so a batch is ruled on in order', async () => {
    await writeAnimation(paths, waiting('c1', 'k1', 'batch'));
    await writeAnimation(paths, waiting('c2', 'k2', 'batch'));

    const opened = await openReviewWhenBatchLands(
      paths,
      (await readAnimation(paths, 'char1', 'c2'))!,
    );

    expect(opened).toBe(true);
    expect((await readState(paths)).sprite.openAnimationId).toBe('c1');
  });

  it('is not held shut for ever by one animation that failed', async () => {
    // A failure has to count as finished, or one bad clip locks the whole
    // batch's review and the frames of the good ones can never be chosen.
    await writeAnimation(paths, waiting('c1', 'k1', 'batch'));
    await writeAnimation(paths, animation('c2', 'failed', { batchId: 'batch' }));

    expect(
      await openReviewWhenBatchLands(paths, (await readAnimation(paths, 'char1', 'c1'))!),
    ).toBe(true);
  });

  it('moves on to the next one once this one has been chosen', async () => {
    await writeAnimation(paths, animation('c1', 'compiling', { batchId: 'batch' }));
    await writeAnimation(paths, waiting('c2', 'k2', 'batch'));

    expect(await openNextReview(paths, (await readAnimation(paths, 'char1', 'c1'))!)).toBe(true);
    expect((await readState(paths)).sprite.openAnimationId).toBe('c2');
  });

  it('says a review is still open, so a finished build does not interrupt it', async () => {
    await writeAnimation(paths, animation('c1', 'compiling', { batchId: 'batch' }));
    await writeAnimation(paths, waiting('c2', 'k2', 'batch'));

    expect(await reviewIsOpen(paths, (await readAnimation(paths, 'char1', 'c1'))!)).toBe(true);
  });

  it('opens the waiting siblings when the last animation is the one that failed', async () => {
    // The batch check used to run only where a proposal succeeded, so the
    // last clip falling over left every review beside it shut.
    await writeAnimation(paths, waiting('c1', 'k1', 'batch'));
    await writeAnimation(paths, animation('c2', 'failed', { batchId: 'batch' }));

    const opened = await openReviewWhenBatchLands(
      paths,
      (await readAnimation(paths, 'char1', 'c2'))!,
    );

    expect(opened).toBe(true);
    expect((await readState(paths)).sprite.openAnimationId).toBe('c1');
  });
});
