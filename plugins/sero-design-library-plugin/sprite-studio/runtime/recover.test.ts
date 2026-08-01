import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../../shared/paths';
import type { AnimationRecord, AnimationStatus, CharacterRecord } from '../shared/character';
import { recoverUnfinishedAnimations } from './recover';
import { readAnimation, writeAnimation, writeCharacter } from './store';

/**
 * An animation whose job died with the app.
 *
 * The queue lives in memory, so nothing on the next start-up is looking for a
 * record left mid-run. Before this, such a record kept its status for ever and
 * the screen showed a spinner on every session — the same shape of fault as a
 * clip nobody decodes.
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

function animation(id: string, status: AnimationStatus, clipFile?: string): AnimationRecord {
  return {
    id,
    characterId: 'char1',
    plan: { name: id, instruction: '', frameCount: 6, playRate: 30, loop: 'once' },
    status,
    canvas: { cols: 0, rows: 0 },
    anchor: { col: 0, row: 0 },
    frames: [],
    findings: [],
    report: null,
    history: [],
    createdAt: 0,
    updatedAt: 0,
    ...(clipFile === undefined ? {} : { clipFile }),
  };
}

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'sprite-recover-'));
  paths = designLibraryPathsFromHome(home);
  await writeCharacter(paths, CHARACTER);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('recoverUnfinishedAnimations', () => {
  it('sends a half-compiled animation back to be decoded again, for nothing', async () => {
    await writeAnimation(paths, animation('a', 'compiling', 'characters/char1/a/clip.mp4'));

    expect(await recoverUnfinishedAnimations(paths)).toEqual({ resumed: 1, failed: 0 });

    const after = await readAnimation(paths, 'char1', 'a');
    // The clip is already on disk, so reading it again costs nothing and the
    // page picks this up the moment it opens.
    expect(after?.status).toBe('awaiting-frames');
    expect(after?.error).toBeUndefined();
  });

  it('stops one that was still being drawn rather than paying for it again', async () => {
    await writeAnimation(paths, animation('b', 'generating'));

    expect(await recoverUnfinishedAnimations(paths)).toEqual({ resumed: 0, failed: 1 });

    const after = await readAnimation(paths, 'char1', 'b');
    expect(after?.status).toBe('failed');
    // Re-running is a paid call, so it is offered rather than taken.
    expect(after?.error).toMatch(/Sero closed/);
  });

  it('stops a compile that has no clip to go back to', async () => {
    await writeAnimation(paths, animation('c', 'compiling'));

    expect(await recoverUnfinishedAnimations(paths)).toEqual({ resumed: 0, failed: 1 });
    expect((await readAnimation(paths, 'char1', 'c'))?.status).toBe('failed');
  });

  it('leaves finished and waiting animations exactly as they are', async () => {
    await writeAnimation(paths, animation('ready', 'ready'));
    await writeAnimation(paths, animation('approved', 'approved'));
    await writeAnimation(paths, animation('planned', 'planned'));
    await writeAnimation(paths, animation('waiting', 'awaiting-frames', 'clip.mp4'));
    await writeAnimation(paths, animation('failed', 'failed'));

    expect(await recoverUnfinishedAnimations(paths)).toEqual({ resumed: 0, failed: 0 });

    for (const id of ['ready', 'approved', 'planned', 'waiting', 'failed']) {
      expect((await readAnimation(paths, 'char1', id))?.status).toBe(
        id === 'waiting' ? 'awaiting-frames' : id,
      );
    }
  });
});
