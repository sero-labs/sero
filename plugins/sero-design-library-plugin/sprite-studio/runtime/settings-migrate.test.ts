import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../../shared/paths';
import { readState, updateState } from '../../shared/state-io';
import type { DesignLibraryState } from '../../shared/types';
import { REPAIR_MODEL } from '../shared/video-models';
import { migrateSpriteSettings } from './settings-migrate';

/**
 * The endpoint that could not do the job was stored in every profile that had
 * ever opened the studio, so correcting the default fixed nobody who was
 * already using it.
 */

let paths: DesignLibraryPaths;
let home: string;

async function storeRepairModel(model: string): Promise<void> {
  await updateState(paths, (state: DesignLibraryState) => ({
    ...state,
    sprite: { ...state.sprite, settings: { ...state.sprite.settings, repairModel: model } },
  }));
}

const storedRepairModel = async (): Promise<string> =>
  (await readState(paths)).sprite.settings.repairModel;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'sprite-settings-'));
  paths = designLibraryPathsFromHome(home);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('migrateSpriteSettings', () => {
  it('replaces an endpoint that was measured as unable to edit a frame', async () => {
    await storeRepairModel('fal-ai/nano-banana-pro/edit');

    expect(await migrateSpriteSettings(paths)).toEqual({
      replaced: 'fal-ai/nano-banana-pro/edit',
    });
    expect(await storedRepairModel()).toBe(REPAIR_MODEL);
  });

  it('leaves a profile that is already correct alone', async () => {
    await storeRepairModel(REPAIR_MODEL);

    expect(await migrateSpriteSettings(paths)).toEqual({ replaced: null });
    expect(await storedRepairModel()).toBe(REPAIR_MODEL);
  });

  it('never overrides an endpoint somebody chose deliberately', async () => {
    // Only the endpoints on the superseded list are replaced. Anything else is
    // a decision, and a start-up chore does not get to undo one.
    await storeRepairModel('fal-ai/some-other/edit');

    expect(await migrateSpriteSettings(paths)).toEqual({ replaced: null });
    expect(await storedRepairModel()).toBe('fal-ai/some-other/edit');
  });
});
