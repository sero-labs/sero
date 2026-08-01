/**
 * Settings written before a measurement corrected them.
 *
 * A default is only a default until it is stored. Every profile that has ever
 * opened Sprite Studio holds a full settings object on disk, so correcting
 * `DEFAULT_SPRITE_STUDIO_SETTINGS` fixes new profiles and leaves every existing
 * one buying the same broken thing for ever.
 *
 * That matters here more than usual, because `repairModel` has no interface. The
 * user cannot see the value, cannot change it, and has no way of knowing that
 * the endpoint it names cannot do the job — so leaving it to them is leaving it
 * unfixed. It is replaced at start-up instead, and only where it names an
 * endpoint that was measured as unusable.
 */

import type { DesignLibraryPaths } from '../../shared/paths';
import { readState, updateState } from '../../shared/state-io';
import type { DesignLibraryState } from '../../shared/types';
import { REPAIR_MODEL, SUPERSEDED_REPAIR_MODELS } from '../shared/video-models';

export interface MigratedSettings {
  /** The endpoint that was replaced, or null when nothing needed changing. */
  replaced: string | null;
}

export async function migrateSpriteSettings(
  paths: DesignLibraryPaths,
): Promise<MigratedSettings> {
  const current = (await readState(paths)).sprite.settings.repairModel;
  if (!SUPERSEDED_REPAIR_MODELS.includes(current)) return { replaced: null };

  await updateState(paths, (state: DesignLibraryState) => ({
    ...state,
    sprite: {
      ...state.sprite,
      settings: { ...state.sprite.settings, repairModel: REPAIR_MODEL },
    },
  }));
  return { replaced: current };
}
