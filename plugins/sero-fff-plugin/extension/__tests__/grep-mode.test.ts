import { describe, expect, it } from 'vitest';

import { detectGrepMode, isWildcardOnly, pathTargetsFile } from '../grep-mode';

describe('detectGrepMode', () => {
  it('treats a bare identifier as a literal search', () => {
    expect(detectGrepMode('registerFindTool')).toBe('plain');
    expect(detectGrepMode('export function')).toBe('plain');
  });

  it('uses regex mode for a pattern that compiles as one', () => {
    expect(detectGrepMode('export (function|const)')).toBe('regex');
    expect(detectGrepMode('^import .* from')).toBe('regex');
  });

  it('falls back to literal matching for a pattern that cannot compile', () => {
    expect(detectGrepMode('foo(bar')).toBe('plain');
    expect(detectGrepMode('a{2,1}')).toBe('plain');
  });
});

describe('isWildcardOnly', () => {
  it('detects patterns that match every line', () => {
    expect(isWildcardOnly('.*')).toBe(true);
    expect(isWildcardOnly('.+')).toBe(true);
    expect(isWildcardOnly('  .*  ')).toBe(true);
    expect(isWildcardOnly('^.*$')).toBe(true);
  });

  it('leaves real patterns alone', () => {
    expect(isWildcardOnly('useState')).toBe(false);
    expect(isWildcardOnly('export .*Tool')).toBe(false);
  });
});

describe('pathTargetsFile', () => {
  it('recognises a constraint that pins one file', () => {
    expect(pathTargetsFile('src/main.ts')).toBe(true);
    expect(pathTargetsFile('config.json')).toBe(true);
  });

  it('treats a directory or glob constraint as unpinned', () => {
    expect(pathTargetsFile('src/')).toBe(false);
    expect(pathTargetsFile('src/**/*')).toBe(false);
    expect(pathTargetsFile(undefined)).toBe(false);
  });
});
