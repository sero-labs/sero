import { describe, expect, it } from 'vitest';

import { countConflicts } from './conflict-markers';
import { parseConflictRegions, rebuildWithResolutions } from './conflict-regions';

const TWO_CONFLICTS = [
  'const scale = 2;',
  '<<<<<<< HEAD',
  '  const out = format(v, 2);',
  '=======',
  '  const out = format(v, 2, currency);',
  '>>>>>>> feat/changelog',
  '',
  'function guard() {',
  '<<<<<<< HEAD',
  '  if (!v) return;',
  '=======',
  '  if (!v) return null;',
  '>>>>>>> feat/changelog',
  '}',
].join('\n');

const DIFF3 = [
  '<<<<<<< HEAD',
  'const PRECISION = 2;',
  '||||||| merged common ancestors',
  'const PRECISION = 1;',
  '=======',
  'const PRECISION = 4;',
  '>>>>>>> incoming',
].join('\n');

describe('parseConflictRegions', () => {
  it('reads both sides, their labels, and where the block sits', () => {
    const regions = parseConflictRegions(TWO_CONFLICTS);

    expect(regions).toHaveLength(2);
    expect(regions[0]).toMatchObject({
      index: 0,
      current: '  const out = format(v, 2);',
      incoming: '  const out = format(v, 2, currency);',
      currentLabel: 'HEAD',
      incomingLabel: 'feat/changelog',
      startLine: 2,
      endLine: 6,
    });
    expect(regions[1]?.index).toBe(1);
    expect(regions[1]?.current).toBe('  if (!v) return;');
  });

  it('reads the common ancestor from diff3-style markers', () => {
    const [region] = parseConflictRegions(DIFF3);
    expect(region?.base).toBe('const PRECISION = 1;');
    expect(region?.current).toBe('const PRECISION = 2;');
    expect(region?.incoming).toBe('const PRECISION = 4;');
  });

  it('leaves the ordinary two-way case without a base', () => {
    expect(parseConflictRegions(TWO_CONFLICTS)[0]?.base).toBeUndefined();
  });

  // The count the rest of the UI trusts comes from the library's own regex. If
  // this parser disagreed, a file could look resolved to one and conflicted to
  // the other — and the disagreement decides whether the file gets staged.
  it('agrees with the marker count the resolver uses', () => {
    expect(parseConflictRegions(TWO_CONFLICTS)).toHaveLength(countConflicts(TWO_CONFLICTS));
    expect(parseConflictRegions(DIFF3)).toHaveLength(countConflicts(DIFF3));
  });

  it('ignores a block that never closes', () => {
    const truncated = '<<<<<<< HEAD\nsomething\n=======\nsomething else\n';
    expect(parseConflictRegions(truncated)).toHaveLength(0);
  });

  it('finds nothing in a clean file', () => {
    expect(parseConflictRegions('const a = 1;\nconst b = 2;\n')).toHaveLength(0);
  });
});

describe('rebuildWithResolutions', () => {
  it('replaces only what it was given and leaves the rest conflicted', () => {
    const rebuilt = rebuildWithResolutions(
      TWO_CONFLICTS,
      new Map([[0, '  const out = format(v, scale, currency);']]),
    );

    expect(rebuilt).toContain('  const out = format(v, scale, currency);');
    expect(rebuilt).not.toContain('>>>>>>> feat/changelog\n\nfunction guard');
    // The second block is untouched, so the file still has exactly one conflict.
    expect(countConflicts(rebuilt)).toBe(1);
  });

  it('resolves every block when given every index', () => {
    const rebuilt = rebuildWithResolutions(
      TWO_CONFLICTS,
      new Map([[0, '  const out = format(v, scale);'], [1, '  if (!v) return null;']]),
    );

    expect(countConflicts(rebuilt)).toBe(0);
    expect(rebuilt).toContain('const scale = 2;');
    expect(rebuilt).toContain('}');
  });

  it('drops the block entirely when the resolution is neither side', () => {
    const rebuilt = rebuildWithResolutions(TWO_CONFLICTS, new Map([[0, '']]));
    expect(rebuilt.startsWith('const scale = 2;\n\nfunction guard() {')).toBe(true);
  });

  // Indices are against the original, so applying the same map twice — which is
  // what undo and re-answering both do — has to land in the same place.
  it('is stable when the same resolutions are applied again', () => {
    const resolutions = new Map([[1, '  if (!v) return null;']]);
    const once = rebuildWithResolutions(TWO_CONFLICTS, resolutions);
    expect(rebuildWithResolutions(TWO_CONFLICTS, resolutions)).toBe(once);
  });

  // What "Undo AI resolutions" is: rebuild with only the answered ones left in.
  it('reverts a resolution by rebuilding without it', () => {
    const all = new Map([[0, 'ai chose this'], [1, 'you chose this']]);
    const yoursOnly = new Map([[1, 'you chose this']]);

    expect(rebuildWithResolutions(TWO_CONFLICTS, all)).toContain('ai chose this');
    const undone = rebuildWithResolutions(TWO_CONFLICTS, yoursOnly);
    expect(undone).not.toContain('ai chose this');
    expect(undone).toContain('you chose this');
    expect(countConflicts(undone)).toBe(1);
  });

  it('keeps CRLF files on CRLF', () => {
    const crlf = TWO_CONFLICTS.replace(/\n/g, '\r\n');
    const rebuilt = rebuildWithResolutions(crlf, new Map([[0, 'resolved']]));
    expect(rebuilt).toContain('\r\n');
    expect(rebuilt).not.toMatch(/[^\r]\n/);
  });

  it('returns a clean file untouched', () => {
    const clean = 'const a = 1;\n';
    expect(rebuildWithResolutions(clean, new Map([[0, 'x']]))).toBe(clean);
  });
});
