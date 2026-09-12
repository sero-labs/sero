import { describe, expect, it } from 'vitest';

import { detectCategory } from '../compaction/category';
import { compactCapture } from '../compaction';
import { compactBuildOutput } from '../compaction/build';
import { compactGitOutput } from '../compaction/git';
import { compactLinterOutput } from '../compaction/lint';
import { compactPackageManagerOutput } from '../compaction/package-manager';
import { groupSearchOutput } from '../compaction/search';
import { compactTestOutput } from '../compaction/test';
import { applyPreservationGuard, preservesProtectedContent } from '../compaction/preservation';
import { buildPreview } from '../preview';

describe('category detection', () => {
  it('recognises safe categories', () => {
    expect(detectCategory('pnpm test')).toBe('test');
    expect(detectCategory('pnpm run test')).toBe('test');
    expect(detectCategory('pnpm exec vitest')).toBe('test');
    expect(detectCategory('cargo test')).toBe('test');
    expect(detectCategory('pnpm run build')).toBe('build');
    expect(detectCategory('tsc --noEmit')).toBe('build');
    expect(detectCategory('pnpm exec tsc --noEmit')).toBe('build');
    expect(detectCategory('eslint .')).toBe('lint');
    expect(detectCategory('pnpm exec eslint .')).toBe('lint');
    expect(detectCategory('git status')).toBe('git');
    expect(detectCategory('git log --oneline')).toBe('git');
    expect(detectCategory('pnpm install')).toBe('packageManager');
    expect(detectCategory('rg foo')).toBe('search');
    expect(detectCategory('git status | grep modified')).toBe('search');
    expect(detectCategory('echo hello')).toBe('none');
  });
});

describe('test compaction', () => {
  it('retains an early failure and the summary past 2000 progress lines', () => {
    const progress = Array.from({ length: 2500 }, (_, index) => `✓ passing test ${index}`).join('\n');
    const source = [
      'FAIL src/a.test.ts',
      '  expected 1 to be 2',
      '    at src/a.test.ts:3:5',
      progress,
      'Tests: 1 failed, 1 passed',
    ].join('\n');

    const candidate = compactTestOutput(source);
    expect(candidate).not.toBeNull();
    expect(candidate).toContain('FAIL src/a.test.ts');
    expect(candidate).toContain('expected 1 to be 2');
    expect(candidate).toContain('Tests: 1 failed, 1 passed');
    expect(candidate?.length).toBeLessThan(source.length);
  });

  it('leaves an output with no failure unchanged', () => {
    expect(compactTestOutput('✓ one\n✓ two\n')).toBeNull();
  });
});

describe('build compaction', () => {
  it('keeps errors and warnings with file and line', () => {
    const source = [
      'Compiling foo',
      "error: cannot find name 'x'",
      '  --> src/a.ts:10:5',
      'warning: unused variable',
      'Compiling bar',
    ].join('\n');

    const candidate = compactBuildOutput(source);
    expect(candidate).not.toBeNull();
    expect(candidate).toContain("error: cannot find name 'x'");
    expect(candidate).toContain('src/a.ts:10:5');
    expect(candidate).toContain('warning: unused variable');
    expect(candidate).not.toContain('Compiling foo');
  });
});

describe('lint compaction', () => {
  it('groups diagnostics and retains counts', () => {
    const issues = Array.from(
      { length: 20 },
      (_, index) => `src/a.ts:${index + 1}:5: Unexpected any  [no-explicit-any]`,
    );
    const candidate = compactLinterOutput(issues.join('\n'));
    expect(candidate).not.toBeNull();
    expect(candidate).toContain('src/a.ts (20)');
    expect(candidate).toContain('no-explicit-any (20)');
    expect(candidate).toContain('Unexpected any');
  });
});

describe('git compaction', () => {
  it('keeps every path in a status with more than five changed files', () => {
    const source = [
      '## main',
      ' M src/a.ts',
      ' M src/b.ts',
      ' M src/c.ts',
      ' M src/d.ts',
      ' M src/e.ts',
      ' M src/f.ts',
      '?? src/g.ts',
    ].join('\n');

    const candidate = compactGitOutput(source);
    expect(candidate).not.toBeNull();
    for (const path of ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts', 'src/f.ts', 'src/g.ts']) {
      expect(candidate).toContain(path);
    }
  });

  it('retains a long commit message in full', () => {
    const message = 'fix: this is a very long commit message that must be retained in full because the reference implementation truncated it';
    const source = [
      'commit abc1234567890abcdef',
      'Author: A',
      'Date: D',
      '',
      `    ${message}`,
    ].join('\n');

    const candidate = compactGitOutput(source);
    expect(candidate).not.toBeNull();
    expect(candidate).toContain('abc1234567890abcdef');
    expect(candidate).toContain(message);
  });
});

describe('package-manager compaction', () => {
  it('keeps errors and drops progress', () => {
    const source = ['Progress: resolved 100', 'Downloading foo', 'error: install failed', 'Done in 3s'].join('\n');
    const candidate = compactPackageManagerOutput(source);
    expect(candidate).not.toBeNull();
    expect(candidate).toContain('error: install failed');
    expect(candidate).not.toContain('Progress: resolved 100');
  });
});

describe('search grouping', () => {
  it('keeps every path and matched line without abbreviation', () => {
    const path = 'src/components/very/long/path/file.ts';
    const source = Array.from(
      { length: 12 },
      (_, index) => `${path}:${index + 1}:const value${index} = ${index}`,
    ).join('\n');

    const candidate = groupSearchOutput(source);
    expect(candidate).not.toBeNull();
    expect(candidate).toContain(path);
    for (let index = 0; index < 12; index += 1) {
      expect(candidate).toContain(`const value${index} = ${index}`);
    }
  });

  it('keeps the raw candidate when grouping would grow it', () => {
    expect(groupSearchOutput('a.ts:1:x\na.ts:2:y')).toBeNull();
  });
});

describe('preservation guard', () => {
  it('rejects a lossy result that drops a diagnostic', () => {
    const source = 'error: boom\n  --> src/a.ts:1:1';
    expect(applyPreservationGuard(source, 'all good', 'build')).toBe(source);
  });

  it('keeps protected diagnostics in the complete candidate when they exceed the preview budget', () => {
    const source = Array.from(
      { length: 4000 },
      (_, index) => `error: failure number ${index} in src/generated/file-${index}.ts:${index}:1`,
    ).join('\n');
    expect(Buffer.byteLength(source, 'utf8')).toBeGreaterThan(50 * 1024);

    const outcome = compactCapture(source, 'build');
    expect(preservesProtectedContent(source, outcome.candidate, 'build')).toBe(true);

    const preview = buildPreview(outcome.candidate);
    expect(preview.truncated).toBe(true);
    expect(Buffer.byteLength(preview.content, 'utf8')).toBeLessThanOrEqual(50 * 1024);
    expect(outcome.candidate).toContain('error: failure number 3999');
  });
});

describe('compactCapture', () => {
  it('recognises a category whose rule found nothing to remove', () => {
    const outcome = compactCapture('no diagnostics here', 'build');
    expect(outcome.recognized).toBe(true);
    expect(outcome.changed).toBe(false);
    expect(outcome.candidate).toBe('no diagnostics here');
  });

  it('strips ANSI from a recognised category', () => {
    const outcome = compactCapture('\u001B[31mCompiling foo\u001B[0m', 'build');
    expect(outcome.changed).toBe(true);
    expect(outcome.candidate).toBe('Compiling foo');
  });

  it('leaves an unrecognised category unchanged', () => {
    const outcome = compactCapture('plain text', 'none');
    expect(outcome.changed).toBe(false);
    expect(outcome.candidate).toBe('plain text');
  });
});
