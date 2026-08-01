/**
 * Animations left mid-run when Sero closed.
 *
 * The queue is in memory. An animation whose job was running when the app was
 * shut down keeps the status that job left on the record — `generating`,
 * `compiling`, `judging` — and nothing on the next start-up is looking for it.
 * It sits under a spinner for ever, on this session and on every session after
 * it, which is the same shape of fault as a clip nobody decodes.
 *
 * So every unfinished animation is settled here, before anything else runs, and
 * the two cases are settled differently because one of them costs money:
 *
 *   proposing / compiling / judging — the clip is on disk and re-reading it is
 *     free, so it goes back to `awaiting-frames` and the open page picks it up
 *     again.
 *   generating — the clip was still being drawn and may or may not exist. It is
 *     marked failed with a sentence saying so. Re-running it is a paid call, and
 *     that is the user's decision to make rather than one to make on their
 *     behalf while they are not looking.
 *
 * `awaiting-review` is deliberately absent. It is a resting state: nothing was
 * running when the app closed, the samples are still staged and the proposal is
 * still on the record, so the review is resumed by being left alone.
 */

import type { DesignLibraryPaths } from '../../shared/paths';
import { settleReview } from './review';
import { listAnimations, listCharacters, mutateAnimation } from './store';

/** Statuses that only a running job can move on from. */
const UNFINISHED = new Set(['generating', 'proposing', 'compiling', 'judging']);

export interface RecoveredAnimations {
  /** Sent back to the page to have their frames pulled out again. */
  resumed: number;
  /** Stopped, because carrying on would mean paying again. */
  failed: number;
}

export async function recoverUnfinishedAnimations(
  paths: DesignLibraryPaths,
): Promise<RecoveredAnimations> {
  let resumed = 0;
  let failed = 0;

  for (const character of await listCharacters(paths)) {
    for (const animation of await listAnimations(paths, character.id)) {
      if (animation.deletedAt !== undefined || !UNFINISHED.has(animation.status)) continue;

      const canResume = animation.status !== 'generating' && animation.clipFile !== undefined;
      if (canResume) resumed += 1;
      else failed += 1;

      await mutateAnimation(paths, character.id, animation.id, (current) => ({
        ...current,
        ...(canResume
          ? { status: 'awaiting-frames' as const, error: undefined }
          : {
              status: 'failed' as const,
              error:
                'Sero closed while this was being made, so it never finished. Running it again draws a new clip.',
            }),
      }));
      // A half-made proposal names samples the page is about to stage again
      // under a new key, so the old ones are released rather than left to be
      // swept an hour later.
      await settleReview(paths, animation);
    }
  }

  return { resumed, failed };
}

/**
 * Animations that were asked for and never started.
 *
 * `planned` is written when the request lands, and the job is queued straight
 * afterwards — so a process that died in between, or one that closed while the
 * job was still waiting its turn behind the concurrency cap, leaves a record
 * nothing is working on. It is invisible to the settlement above, which only
 * looks at statuses a *running* job leaves behind, and invisible to the request
 * log, whose replay skips an animation that already exists. It sits under
 * "Planned" for ever.
 *
 * Resuming is safe rather than merely convenient: `runAnimate` sets
 * `generating` before it reaches the provider, so anything still at `planned`
 * has not been paid for. The same fault and the same repair as a Design variant
 * left `pending` with no job.
 */
export async function resumePlannedAnimations(
  paths: DesignLibraryPaths,
): Promise<{ characterId: string; animationId: string }[]> {
  const waiting: { characterId: string; animationId: string }[] = [];
  for (const character of await listCharacters(paths)) {
    for (const animation of await listAnimations(paths, character.id)) {
      if (animation.deletedAt === undefined && animation.status === 'planned') {
        waiting.push({ characterId: character.id, animationId: animation.id });
      }
    }
  }
  return waiting;
}
