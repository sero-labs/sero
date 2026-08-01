import { describe, expect, it } from 'vitest';

import { designLibraryPathsFromHome } from '../../shared/paths';
import { animationDir, characterDir, samplesDir } from './paths';

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
