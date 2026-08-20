import { describe, expect, it } from 'vitest';
import { createIgnoreMatcher } from './ignore-matcher';

const match = (patterns: string[]) => createIgnoreMatcher([patterns]);

describe('createIgnoreMatcher', () => {
  it('excludes only the subtree a nested pattern names', () => {
    // The regression this exists for: reducing `coverage/**` to its last
    // segment produced `**`, which matched every path — so a whole repository
    // scanned as zero files and zero cost, bypassing the file and cost caps.
    const matcher = match(['coverage/**']);
    expect(matcher.ignores('coverage/lcov.info')).toBe(true);
    expect(matcher.ignores('coverage/html/index.html')).toBe(true);
    expect(matcher.ignores('src/index.ts')).toBe(false);
    expect(matcher.ignores('README.md')).toBe(false);
  });

  it('matches a bare name at any depth', () => {
    const matcher = match(['node_modules/']);
    expect(matcher.ignores('node_modules/pkg/index.js')).toBe(true);
    expect(matcher.ignores('packages/ui/node_modules/pkg/index.js')).toBe(true);
    expect(matcher.ignores('src/node_modules_helper.ts')).toBe(false);
  });

  it('anchors a leading slash to the workspace root', () => {
    const matcher = match(['/build']);
    expect(matcher.ignores('build/out.js')).toBe(true);
    expect(matcher.ignores('packages/ui/build/out.js')).toBe(false);
  });

  it('keeps * inside one segment', () => {
    const matcher = match(['*.log']);
    expect(matcher.ignores('debug.log')).toBe(true);
    expect(matcher.ignores('logs/debug.log')).toBe(true);
    expect(matcher.ignores('debug.log.ts')).toBe(false);
  });

  it('spans directories for **/', () => {
    const matcher = match(['**/generated']);
    expect(matcher.ignores('generated/a.ts')).toBe(true);
    expect(matcher.ignores('src/deep/generated/a.ts')).toBe(true);
    expect(matcher.ignores('src/deep/other/a.ts')).toBe(false);
  });

  it('drops a whole set containing a negation rather than under-counting', () => {
    // `*` then `!keep` means "only keep/". Applying the exclusion without the
    // re-inclusion would report almost nothing to index, and price a real
    // build at zero.
    const matcher = match(['*', '!keep']);
    expect(matcher.ignores('anything.ts')).toBe(false);
    expect(matcher.unsupported).toContain('!keep');
  });

  it('drops a pattern it cannot represent, and says so', () => {
    const matcher = match(['file[0-9].ts']);
    expect(matcher.ignores('file1.ts')).toBe(false);
    expect(matcher.unsupported).toContain('file[0-9].ts');
  });

  it('ignores comments and blank lines', () => {
    const matcher = match(['# a comment', '', '   ']);
    expect(matcher.ignores('src/index.ts')).toBe(false);
    expect(matcher.unsupported).toEqual([]);
  });

  it('keeps sets independent, so one bad file does not disable the others', () => {
    const matcher = createIgnoreMatcher([['node_modules/'], ['*', '!keep']]);
    expect(matcher.ignores('node_modules/pkg/index.js')).toBe(true);
    expect(matcher.ignores('src/index.ts')).toBe(false);
  });
});
