/**
 * Reactive state, projected from the records.
 *
 * The records are the authority; this slice is a view of them, rebuilt whole
 * after every change because rebuilding is cheap and always correct. It lives
 * apart from the request handlers so that "what the page can see" is one file
 * rather than a tail on the end of "what the page can ask for".
 */

import type { DesignLibraryPaths } from '../../shared/paths';
import { readState, updateState } from '../../shared/state-io';
import type { DesignLibraryState } from '../../shared/types';
import type { AnimationSummary, CharacterSummary } from '../shared/state';
import { animationSummary, characterSummary, listAnimations, listCharacters } from './store';

/**
 * Forget the last problem.
 *
 * Called when a request succeeds, because a notice that outlives the fault it
 * describes is worse than none: it says something is broken while the thing it
 * complained about is working.
 */
export async function clearSpriteProblem(paths: DesignLibraryPaths): Promise<void> {
  await updateState(paths, (current: DesignLibraryState) => {
    if (current.sprite.notice === undefined) return null;
    const { notice: _dropped, ...sprite } = current.sprite;
    return { ...current, sprite };
  });
}

/**
 * What the page is looking at, said outright.
 *
 * Both keys are assigned from the request rather than skipped when absent, so
 * "the character sheet" is a different instruction from "leave it alone".
 * Omitting them made closing an animation impossible: the sheet opened, and
 * reopening the page landed back on the animation.
 */
export async function setOpen(
  paths: DesignLibraryPaths,
  open: { characterId?: string; animationId?: string },
): Promise<void> {
  await updateState(paths, (current: DesignLibraryState) => {
    const {
      openCharacterId: _character,
      openAnimationId: _animation,
      ...rest
    } = current.sprite;
    return {
      ...current,
      sprite: {
        ...rest,
        ...(open.characterId === undefined ? {} : { openCharacterId: open.characterId }),
        ...(open.animationId === undefined ? {} : { openAnimationId: open.animationId }),
      },
    };
  });
}

/** Rebuild the whole slice from the records. Cheap, and always correct. */
export async function projectSpriteState(paths: DesignLibraryPaths): Promise<void> {
  const characters = await listCharacters(paths);
  const summaries: CharacterSummary[] = [];
  const animations: AnimationSummary[] = [];
  // The rate frames are sampled at rides on the summary, because the page is
  // what does the sampling and it reads summaries rather than settings files.
  const sampleFps = (await readState(paths)).sprite.settings.sampleFps;
  for (const character of characters) {
    const owned = await listAnimations(paths, character.id);
    summaries.push(characterSummary(character, owned));
    for (const animation of owned) {
      if (animation.deletedAt !== undefined) continue;
      animations.push(animationSummary(paths, animation, sampleFps));
    }
  }
  await updateState(paths, (current: DesignLibraryState) => {
    // `progress` is the one thing on a summary that has no record behind it —
    // it is a line about work in flight, not a fact about a sequence. Rebuilding
    // without carrying it over blanks the rail every time anything else
    // changes, which on a batch of five is constantly.
    const said = new Map(
      current.sprite.animations.map((animation) => [animation.id, animation.progress]),
    );
    return {
      ...current,
      sprite: {
        ...current.sprite,
        characters: summaries,
        animations: animations.map((animation) => {
          const line = WORKING.has(animation.status) ? said.get(animation.id) : undefined;
          return line === undefined ? animation : { ...animation, progress: line };
        }),
      },
    };
  });
}

/** The statuses a progress line still means something under. */
const WORKING = new Set(['generating', 'awaiting-frames', 'proposing', 'compiling', 'judging']);

/**
 * Say what went wrong, where the user can see it.
 *
 * A request is applied in the background, so a refusal has nowhere to appear on
 * its own: the page asks, the runtime throws, the watermark advances and the
 * button looks broken. This is the only reason the notice exists.
 */
export async function reportSpriteProblem(
  paths: DesignLibraryPaths,
  message: string,
): Promise<void> {
  await reportSpriteNotice(paths, message, 'problem');
}

/**
 * The same bar, for work that finished.
 *
 * An export writes two files and has no row in the interface to say so from, so
 * without this it succeeds in silence and the user never learns where the sheet
 * went.
 */
export async function reportSpriteNotice(
  paths: DesignLibraryPaths,
  message: string,
  tone: 'problem' | 'done',
): Promise<void> {
  await updateState(paths, (current: DesignLibraryState) => ({
    ...current,
    sprite: { ...current.sprite, notice: { message, at: Date.now(), tone } },
  }));
}
