import { describe, expect, it } from 'vitest';

import { characterProblem, type CharacterRecord } from './character';

/**
 * A reference that cannot work, refused before anything is paid for.
 *
 * Approving a character is what unlocks generation, and everything downstream
 * inherits from it: a character measured wrong makes every animation ever made
 * from it wrong, and each of those is a paid clip. So this is the cheapest
 * place in the feature to say no — and for a long time it said nothing,
 * because `characterProblem` was written and never called.
 */

function character(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return {
    id: 'char1',
    name: 'Explorer',
    source: 'reference',
    status: 'draft',
    palette: ['#000000', '#ffffff'],
    cap: { kind: 'measured' },
    ramps: [],
    artHeight: 136,
    artWidth: 62,
    exportScale: 8,
    basePoseFile: 'characters/char1/base.png',
    root: { footRow: 135, centreCol: 31 },
    styleNotes: '',
    ingestion: {
      block: 8,
      lift: 8,
      sourceWidth: 496,
      sourceHeight: 1088,
      measuredColours: 66,
      residual: 0,
      backgroundRemoved: true,
    },
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('a reference whose pixel grid has been destroyed', () => {
  it('refuses it, and says what to do about it', () => {
    // The real numbers from a JPEG of the Explorer: no grid found, and the
    // "artwork" measured at the size of the file. The same picture as a PNG
    // measures 62 × 136 at 8× with 66 colours.
    const problem = characterProblem(
      character({
        artWidth: 493,
        artHeight: 1084,
        exportScale: 1,
        ingestion: {
          block: 1,
          lift: 0,
          sourceWidth: 784,
          sourceHeight: 1168,
          measuredColours: 231,
          residual: 0,
          backgroundRemoved: true,
        },
      }),
    );

    expect(problem).not.toBeNull();
    expect(problem).toMatch(/JPEG or has been resized/);
    // The size it measured, so the user can see for themselves how wrong it is.
    expect(problem).toMatch(/493 × 1084/);
  });

  it('allows real pixel art that is already at its true size', () => {
    // A 62 × 136 PNG drawn one file pixel per art pixel is a legitimate `block
    // of 1`, and refusing it would be worse than the fault being fixed.
    expect(
      characterProblem(
        character({
          exportScale: 1,
          ingestion: {
            block: 1,
            lift: 0,
            sourceWidth: 62,
            sourceHeight: 136,
            measuredColours: 66,
            residual: 0,
            backgroundRemoved: true,
          },
        }),
      ),
    ).toBeNull();
  });

  it('passes the reference that works', () => {
    expect(characterProblem(character())).toBeNull();
  });
});

describe('the checks that were already there', () => {
  it('refuses a character with no palette', () => {
    expect(characterProblem(character({ palette: [] }))).toMatch(/no palette/);
  });

  it('refuses a fractional export scale, because the pixels would blur', () => {
    expect(characterProblem(character({ exportScale: 2.5 }))).toMatch(/whole number/);
  });
});
