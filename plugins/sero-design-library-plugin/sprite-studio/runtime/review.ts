/**
 * Everything that keeps a review honest: what holds it open, and what ends it.
 *
 * A review is the one resting state in Sprite Studio that depends on files
 * nothing is currently working on. That is exactly the shape of fault this
 * feature area keeps producing — one side depending on something the other
 * quietly deleted — so the two halves of it live together here rather than
 * being spread over the handlers that happen to trigger them.
 *
 *   held    — the staged samples of an open review, so housekeeping leaves them.
 *   settled — chosen, discarded, redone or failed: the samples and the previews
 *             go, and the proposal comes off the record in the same breath.
 */

import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';

import type { DesignLibraryPaths } from '../../shared/paths';
import type { AnimationRecord, AnimationStatus } from '../shared/character';
import { samplesDir } from '../shared/paths';
import { clearSamples } from './generation/propose';
import { setOpen } from './projection';
import { clearStaged } from './staging';
import { listAnimations, listCharacters, mutateAnimation } from './store';

/**
 * Statuses an animation of a batch can still be working under.
 *
 * `failed` is deliberately not one of them. One animation that fails must not
 * hold the whole batch's review shut for ever.
 */
const WORKING: ReadonlySet<AnimationStatus> = new Set<AnimationStatus>([
  'planned',
  'generating',
  'awaiting-frames',
  'proposing',
  'compiling',
  'judging',
]);

/** The other animations created by the same `sprite.generate`, and this one. */
async function batch(
  paths: DesignLibraryPaths,
  animation: AnimationRecord,
): Promise<AnimationRecord[]> {
  const owned = await listAnimations(paths, animation.characterId);
  return owned.filter(
    (one) =>
      one.deletedAt === undefined &&
      (animation.batchId === undefined ? one.id === animation.id : one.batchId === animation.batchId),
  );
}

/**
 * Put a finished proposal in front of the user, once the batch has stopped.
 *
 * One animation opens as soon as it is ready. A batch opens once, at the end,
 * when nothing in it is still working — a review that interrupted a running
 * batch would stop the user four times for a decision they asked for in one go.
 */
export async function openReviewWhenBatchLands(
  paths: DesignLibraryPaths,
  animation: AnimationRecord,
): Promise<boolean> {
  const siblings = await batch(paths, animation);
  if (siblings.some((one) => WORKING.has(one.status))) return false;
  // The earliest one still waiting, so a batch is reviewed in the order it was
  // asked for. `listAnimations` already sorts by creation.
  const first = siblings.find((one) => one.status === 'awaiting-review');
  if (first === undefined) return false;
  await setOpen(paths, { characterId: animation.characterId, animationId: first.id });
  return true;
}

/**
 * Move on to the next proposal of the same batch, if one is waiting.
 *
 * Called once a review has been settled, so the user walks the batch in one
 * pass instead of going back to the rail between each one.
 */
export async function openNextReview(
  paths: DesignLibraryPaths,
  animation: AnimationRecord,
): Promise<boolean> {
  const siblings = await batch(paths, animation);
  const next = siblings.find((one) => one.id !== animation.id && one.status === 'awaiting-review');
  if (next === undefined) return false;
  await setOpen(paths, { characterId: animation.characterId, animationId: next.id });
  return true;
}

/** True while any animation of this batch is still waiting to be reviewed. */
export async function reviewIsOpen(
  paths: DesignLibraryPaths,
  animation: AnimationRecord,
): Promise<boolean> {
  return (await batch(paths, animation)).some((one) => one.status === 'awaiting-review');
}

/**
 * End a review: drop the samples, the previews and the proposal.
 *
 * Both halves in one call, because doing one without the other is the fault
 * this file exists to prevent — a record pointing at samples that have gone, or
 * ten megabytes of staged frames nothing will ever read again.
 *
 * Safe to call on an animation that has no review, which is why every path out
 * of one calls it without asking first.
 */
export async function settleReview(
  paths: DesignLibraryPaths,
  animation: Pick<AnimationRecord, 'id' | 'characterId' | 'review'>,
): Promise<void> {
  // The pointer first, then the files. Interrupted the other way round leaves a
  // record naming samples that have gone, which is the state this whole file
  // exists to prevent; interrupted this way round leaves files nothing names,
  // which housekeeping sweeps.
  await mutateAnimation(paths, animation.characterId, animation.id, (current) => {
    const { review: _dropped, ...rest } = current;
    return rest;
  });
  await releaseSamples(paths, animation);
}

/**
 * The files half of settling, for the one caller that is about to delete the
 * record anyway. Sixty source frames per animation is roughly ten megabytes,
 * and they live outside the animation's own directory.
 */
export async function releaseSamples(
  paths: DesignLibraryPaths,
  animation: Pick<AnimationRecord, 'id' | 'characterId' | 'review'>,
): Promise<void> {
  if (animation.review !== undefined) {
    await clearStaged(paths, animation.review.stagingKey);
  }
  await clearSamples(paths, animation.characterId, animation.id);
}

/**
 * Staging keys an open review is still holding.
 *
 * Housekeeping deletes staged files nothing is waiting on, and it decides that
 * by looking at the pending requests. An animation sitting at the review has no
 * pending request — it is waiting on a person — so without this its samples are
 * deleted underneath it an hour after the clip arrived, and the review can
 * never be finished.
 */
/**
 * Preview directories no review names any more.
 *
 * Settling clears the record pointer first and the files second, so an
 * interruption between the two leaves previews nothing points at — and unlike
 * staged frames, which the staging sweep reaches, these live inside the
 * animation's own directory where nothing was looking. Run at start-up.
 */
export async function sweepOrphanSamples(paths: DesignLibraryPaths): Promise<number> {
  let removed = 0;
  for (const character of await listCharacters(paths)) {
    for (const animation of await listAnimations(paths, character.id)) {
      // Only an open review is allowed to have them.
      if (animation.status === 'awaiting-review' && animation.review !== undefined) continue;
      const directory = samplesDir(paths, character.id, animation.id);
      if (!existsSync(directory)) continue;
      await rm(directory, { recursive: true, force: true });
      removed += 1;
    }
  }
  return removed;
}

export async function heldStagingKeys(paths: DesignLibraryPaths): Promise<string[]> {
  const keys: string[] = [];
  for (const character of await listCharacters(paths)) {
    for (const animation of await listAnimations(paths, character.id)) {
      // Every key any proposal still names, whatever the status. Not just
      // `awaiting-review`: choosing the frames claims the animation into
      // `compiling` while the proposal is still on the record, and the build
      // has not read the samples yet. Narrowing this to the resting state left
      // a window where they could be cleared out from under a queued build.
      if (animation.review !== undefined) keys.push(animation.review.stagingKey);
    }
  }
  return keys;
}
