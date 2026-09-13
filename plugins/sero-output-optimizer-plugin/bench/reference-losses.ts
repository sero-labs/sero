/**
 * Vendored reference outputs from `pi-rtk-optimizer` (MIT, Copyright (c) 2026
 * MasuRii).
 *
 * Each entry pairs an input with the reference rule's output and the content it
 * lost. `reference-parity.test.ts` asserts the reference still loses that
 * content and that Sero's rewritten rule does not.
 */

export const REFERENCE_ATTRIBUTION =
  'Generated from pi-rtk-optimizer (MIT, Copyright (c) 2026 MasuRii) to assert its losses do not occur.';

export interface ReferenceLossFixture {
  name: string;
  category: 'git' | 'search';
  input: string;
  referenceOutput: string;
  referenceLoses: string[];
}

export const referenceLosses: ReferenceLossFixture[] = [
  {
    name: 'git-status-many-paths',
    category: 'git',
    input: ['## main', ...Array.from({ length: 8 }, (_, index) => ` M src/file-${index + 1}.ts`)].join('\n'),
    referenceOutput: [
      'Branch: main',
      'Modified: 8 files',
      '  src/file-1.ts',
      '  src/file-2.ts',
      '  src/file-3.ts',
      '  src/file-4.ts',
      '  src/file-5.ts',
      '  ... +3 more',
    ].join('\n'),
    referenceLoses: ['src/file-6.ts', 'src/file-7.ts', 'src/file-8.ts'],
  },
  {
    name: 'git-log-long-message',
    category: 'git',
    input: [
      'commit abc1234567890abcdef',
      'Author: A',
      'Date: D',
      '',
      '    fix: this is a very long commit message that must be retained in full because the reference implementation truncated lines above eighty characters',
    ].join('\n'),
    referenceOutput: [
      'commit abc1234567890abcdef',
      'Author: A',
      'Date: D',
      '',
      '    fix: this is a very long commit message that must be retained in full bec...',
    ].join('\n'),
    referenceLoses: [
      'fix: this is a very long commit message that must be retained in full because the reference implementation truncated lines above eighty characters',
    ],
  },
  {
    name: 'search-long-path-and-line',
    category: 'search',
    input: Array.from(
      { length: 12 },
      (_, index) => `src/components/very/long/path/that/exceeds/fifty/characters/file.ts:${index + 1}:const valueNumber${index} = computeSomethingLongEnoughToExceedSeventyCharacters(${index})`,
    ).join('\n'),
    referenceOutput: [
      '12 matches in 1 files:',
      '',
      '> …/characters/file.ts (12 matches):',
      '    1: const valueNumber0 = computeSomethingLongEnoughToExceedSeventyChara...',
      '    10: const valueNumber9 = computeSomethingLongEnoughToExceedSeventyChara...',
      '  +2 more',
      '',
      '... +2 more',
      '',
    ].join('\n'),
    referenceLoses: [
      'src/components/very/long/path/that/exceeds/fifty/characters/file.ts',
      'computeSomethingLongEnoughToExceedSeventyCharacters(0)',
    ],
  },
];
