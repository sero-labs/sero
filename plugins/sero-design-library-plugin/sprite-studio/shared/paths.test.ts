import { describe, expect, it } from 'vitest';

import { designLibraryPathsFromHome } from '../../shared/paths';
import { animationDir, characterDir, resolveSpriteAsset, samplesDir } from './paths';

/**
 * The guard in front of every recursive delete in Sprite Studio.
 *
 * Four things here remove a whole directory: a character, an animation, a
 * staging key and a staging sweep. Every id they build a path from is untrusted
 * — the tool that carries them is reachable from any chat — and the check lives
 * inside the path helpers rather than at the call sites, so a new call site
 * cannot forget it.
 *
 * This is the attack list rather than a reading of the rule, and it is a test
 * so the rule cannot be loosened later without something failing.
 */

const HOME = '/tmp/design-library-home';
const paths = designLibraryPathsFromHome(HOME);

const HOSTILE: [string, string][] = [
  // The dangerous one. `path.join(charactersDir, '')` is `charactersDir`, so an
  // empty id aims a recursive delete at every character at once.
  ['', 'empty'],
  ['.', 'this directory'],
  ['..', 'the parent'],
  ['../..', 'two up'],
  ['../../../../etc', 'traversal'],
  ['/', 'the root'],
  ['//', 'the root twice'],
  ['a/../../b', 'traversal in the middle'],
  ['a/b', 'a separator'],
  ['a\\b', 'a Windows separator'],
  ['.hidden', 'a dot file'],
  ['-rf', 'something that reads as a flag'],
  ['~', 'the home directory'],
  ['$HOME', 'a shell variable'],
  // JavaScript `$` without the `m` flag matches only the true end of the
  // string. In some other languages a trailing newline would slip through.
  ['a\n', 'a trailing newline'],
  ['a\n../..', 'traversal after a newline'],
  ['a\r\n..', 'traversal after a carriage return'],
  ['a /..', 'traversal after a space'],
  [' ', 'one space'],
  ['a ', 'a trailing space'],
  ['\n..', 'a leading newline'],
  ['a'.repeat(129), '129 characters'],
];

describe('the ids a recursive delete may be built from', () => {
  for (const [id, what] of HOSTILE) {
    it(`refuses ${what}: ${JSON.stringify(id)}`, () => {
      expect(() => characterDir(paths, id)).toThrow();
      expect(() => animationDir(paths, 'char1', id)).toThrow();
    });
  }

  it('accepts the ids Sprite Studio really allocates', () => {
    for (const id of [
      'char-1d3b2cb0-b3bc-406c-9262-9fe277fa1da1',
      'anim-plan-2da54cfa-5061-41f9-a145-a42375091e48-3',
      'chrms9mun2d',
      'a'.repeat(128),
    ]) {
      expect(characterDir(paths, id).startsWith(`${HOME}/characters/`)).toBe(true);
    }
  });

  it('keeps every built path inside the home directory', () => {
    // The property the whole rule exists for, stated once rather than implied
    // by the list above.
    for (const built of [
      characterDir(paths, 'char1'),
      animationDir(paths, 'char1', 'anim1'),
      samplesDir(paths, 'char1', 'anim1'),
    ]) {
      expect(built.startsWith(`${HOME}/`)).toBe(true);
      expect(built.includes('..')).toBe(false);
    }
  });
});

/**
 * What the page may ask to be handed the bytes of.
 *
 * The page has no filesystem, so every picture on screen arrives as a path over
 * a tool call — and that tool is reachable from any chat, not only from the
 * page. Bounding it to the app directory is not enough: the provider key sits
 * in `secrets.json` at the top of that directory, kept out of the interface on
 * purpose, and a reader bounded there would hand it to anyone who names it.
 */
describe('the files the sprite tool will read out', () => {
  // Nothing is on disk in this test, so a name that should be allowed is
  // resolved and a name that should not is refused before it gets this far.
  const asItself = async (target: string): Promise<string> => target;

  it('refuses the provider key, which is the whole reason for the boundary', async () => {
    for (const attempt of [
      'secrets.json',
      './secrets.json',
      'characters/../secrets.json',
      'characters/x/../../secrets.json',
      '../design-library/secrets.json',
    ]) {
      expect(await resolveSpriteAsset(paths, attempt, asItself)).toBeNull();
    }
  });

  it('refuses the rest of the plugin, which is not Sprite Studio to give away', async () => {
    for (const attempt of ['state.json', 'items/an-item/record.json', 'gallery', '', '.']) {
      expect(await resolveSpriteAsset(paths, attempt, asItself)).toBeNull();
    }
  });

  it('refuses a link planted inside the tree that points out of it', async () => {
    // The path itself is in bounds; what it resolves to is not. Checking the
    // requested name alone would serve the target of any symlink under
    // `characters/`, which the staging path lets a caller create files in.
    const escape = async (target: string): Promise<string> =>
      target.endsWith('.png') ? `${HOME}/secrets.json` : target;
    expect(await resolveSpriteAsset(paths, 'characters/c/base-pose.png', escape)).toBeNull();
  });

  it('serves a picture when the app directory is itself behind a link', async () => {
    // Every temporary directory on macOS is. Resolving the file but not the
    // root compares `/private/var/...` against `/var/...` and refuses
    // everything, which the tool's own tests caught.
    const linked = async (target: string): Promise<string> => `/private${target}`;
    expect(await resolveSpriteAsset(paths, 'characters/c/base-pose.png', linked)).toBe(
      `${HOME}/characters/c/base-pose.png`,
    );
  });

  it('serves the pictures it is there to serve', async () => {
    for (const allowed of [
      'characters/c/base-pose.png',
      'characters/c/source/reference.jpg',
      'characters/c/animations/a/frames/f.png',
      'characters/c/animations/a/samples/000.png',
      'characters/c/animations/a/clip/clip.mp4',
    ]) {
      expect(await resolveSpriteAsset(paths, allowed, asItself)).toBe(`${HOME}/${allowed}`);
    }
  });
});
