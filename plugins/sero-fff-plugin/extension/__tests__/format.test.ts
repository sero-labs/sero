import { describe, expect, it } from 'vitest';

import {
  clampContext,
  fileAnnotation,
  formatFindOutput,
  formatGrepOutput,
  GREP_CONTEXT_MAX,
  GREP_MAX_LINE_LENGTH,
  truncateLine,
  weakScoreThreshold,
  withNotices,
} from '../format';
import { grepMatch, grepResult, searchResult } from './fixtures/fake-finder';

describe('fileAnnotation', () => {
  it('prefers a dirty git state over frecency', () => {
    expect(fileAnnotation({ gitStatus: 'modified', totalFrecencyScore: 99 })).toBe('  [modified in git]');
  });

  it('annotates frequently touched clean files by frecency band', () => {
    expect(fileAnnotation({ gitStatus: 'clean', totalFrecencyScore: 30 })).toBe('  [very often touched file]');
    expect(fileAnnotation({ gitStatus: 'clean', totalFrecencyScore: 21 })).toBe('  [often touched file]');
  });

  it('says nothing about an ordinary clean file', () => {
    expect(fileAnnotation({ gitStatus: 'clean', totalFrecencyScore: 1 })).toBe('');
    expect(fileAnnotation({ gitStatus: 'unknown' })).toBe('');
  });
});

describe('formatGrepOutput', () => {
  it('groups matches under each file in engine order', () => {
    const output = formatGrepOutput(grepResult([
      grepMatch({ relativePath: 'src/a.ts', lineNumber: 3, lineContent: 'const a = 1;' }),
      grepMatch({ relativePath: 'src/a.ts', lineNumber: 9, lineContent: 'use(a);' }),
      grepMatch({ relativePath: 'src/b.ts', lineNumber: 2, lineContent: 'const b = 2;' }),
    ]));

    expect(output).toBe(
      ['src/a.ts', ' 3: const a = 1;', ' 9: use(a);', '', 'src/b.ts', ' 2: const b = 2;'].join('\n'),
    );
  });

  it('numbers context lines around the match', () => {
    const output = formatGrepOutput(grepResult([
      grepMatch({
        relativePath: 'src/a.ts',
        lineNumber: 10,
        lineContent: 'target',
        contextBefore: ['before-9'],
        contextAfter: ['after-11'],
      }),
    ]));

    expect(output).toBe(['src/a.ts', ' 9- before-9', ' 10: target', ' 11- after-11'].join('\n'));
  });

  it('reports an empty result rather than an empty string', () => {
    expect(formatGrepOutput(grepResult([]))).toBe('No matches found');
  });
});

describe('truncateLine', () => {
  it('caps a long line and marks it as truncated', () => {
    const line = 'x'.repeat(GREP_MAX_LINE_LENGTH + 50);
    const truncated = truncateLine(line);

    expect(truncated).toHaveLength(GREP_MAX_LINE_LENGTH + 3);
    expect(truncated.endsWith('...')).toBe(true);
  });

  it('trims surrounding whitespace on a short line', () => {
    expect(truncateLine('   const a = 1;  ')).toBe('const a = 1;');
  });
});

describe('clampContext', () => {
  it('bounds the caller-supplied context', () => {
    expect(clampContext(undefined)).toBe(0);
    expect(clampContext(-5)).toBe(0);
    expect(clampContext(3.7)).toBe(3);
    expect(clampContext(1000)).toBe(GREP_CONTEXT_MAX);
  });
});

describe('formatFindOutput', () => {
  it('lists up to the limit when the top score is strong', () => {
    const result = searchResult(['a.ts', 'b.ts', 'c.ts'], 3, 1000);
    const formatted = formatFindOutput(result, 10, 'ts');

    expect(formatted.weak).toBe(false);
    expect(formatted.shownCount).toBe(3);
    expect(formatted.output.split('\n')).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  it('samples only a handful when every match is weak fuzzy noise', () => {
    const paths = Array.from({ length: 30 }, (_, index) => `file-${index}.ts`);
    const result = searchResult(paths, 30, 1);
    const formatted = formatFindOutput(result, 30, 'ComponentRegistry');

    expect(formatted.weak).toBe(true);
    expect(formatted.shownCount).toBe(5);
  });

  it('scales the weak-score threshold with the query length', () => {
    expect(weakScoreThreshold('ab')).toBeLessThan(weakScoreThreshold('abcdefgh'));
  });

  it('reports an empty result rather than an empty string', () => {
    expect(formatFindOutput(searchResult([]), 10, 'x').output).toBe('No files found matching pattern');
  });
});

describe('withNotices', () => {
  it('appends notices in one bracketed block', () => {
    expect(withNotices('body', ['a', 'b'])).toBe('body\n\n[a. b]');
  });

  it('leaves output untouched when there is nothing to say', () => {
    expect(withNotices('body', [])).toBe('body');
  });
});
