import { describe, expect, it } from 'vitest';

import { detectCategory } from '../compaction/category';
import { compactCapture, compactStream } from '../compaction';
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
    expect(detectCategory('pnpm test | head -20')).toBe('test');
    expect(detectCategory('rg foo | head -n 5')).toBe('search');
    expect(detectCategory('echo hello')).toBe('none');
  });

  it('refuses one category when a sequence of commands mixes output', () => {
    // The test rule cannot protect the JSON, so the whole command stays raw.
    expect(detectCategory('pnpm test && cat package.json')).toBe('none');
    expect(detectCategory('pnpm test; cat package.json')).toBe('none');
    expect(detectCategory('rg foo && cat package.json')).toBe('none');
    // Two different categories also mix output that one rule cannot protect.
    expect(detectCategory('pnpm test && pnpm build')).toBe('none');
    expect(detectCategory('pnpm install && pnpm build')).toBe('none');
  });

  it('refuses a category when a segment can run code or read a file', () => {
    // `source` and `.` run arbitrary code that can print.
    expect(detectCategory('source ./setup.sh && pnpm test')).toBe('none');
    expect(detectCategory('. ./setup.sh && pnpm test')).toBe('none');
    expect(detectCategory('eval "echo hi" && pnpm test')).toBe('none');
    // `cd -` prints the new directory.
    expect(detectCategory('cd - && pnpm test')).toBe('none');
    // A pipeline stage that reads a file adds content of its own.
    expect(detectCategory('pnpm test | cat package.json -')).toBe('none');
    expect(detectCategory('pnpm test | head package.json')).toBe('none');
  });

  it('preserves output added or transformed by a pipeline filter', () => {
    const output = 'DEPLOY_TARGET=production\n1 passed\n';
    const commands = [
      `pnpm test | awk 'BEGIN {print "DEPLOY_TARGET=production"} {print}'`,
      "pnpm test | sed '1i DEPLOY_TARGET=production'",
      "pnpm test | jq '{result: .}'",
      'pnpm test | base64',
      'pnpm test | head 123',
      'pnpm test | cat 123',
      'pnpm test | head -c 5',
    ];
    for (const command of commands) {
      expect(detectCategory(command), command).toBe('none');
      expect(compactStream(output, detectCategory(command)).preview.content, command).toBe(output);
    }
    expect(detectCategory('pnpm test | cat -')).toBe('test');
    expect(detectCategory('pnpm test | tail -n 5')).toBe('test');
  });

  it('lets a pipeline stage decide the output category', () => {
    // The stage that writes to the terminal produces the visible output, so it
    // decides the category. A grep stage is safe because its matches are the
    // search output, whether it reads standard input or a named file.
    expect(detectCategory('git status | grep modified')).toBe('search');
    expect(detectCategory('pnpm test | grep pattern src/file.ts')).toBe('search');
    expect(detectCategory('pnpm test | tsc --noEmit')).toBe('build');
  });

  it('keeps one category when every command agrees or prints nothing', () => {
    expect(detectCategory('cd apps/desktop && pnpm test')).toBe('test');
    expect(detectCategory('export CI=1 && pnpm test')).toBe('test');
    expect(detectCategory('pnpm test && pnpm test')).toBe('test');
    expect(detectCategory('rg foo && rg bar')).toBe('search');
    // A pipeline keeps its helper: its data still comes from the search command.
    expect(detectCategory('rg foo | head -20')).toBe('search');
  });

  it('preserves every command output when a sequence cannot use one category', () => {
    const json = ['{', '  "name": "fixture",', '  "version": "1.2.3"', '}'].join('\n');
    const output = ['FAIL src/a.test.ts', '  1 failed', 'DEPLOY_TARGET=production', json].join('\n');

    const commands = [
      'pnpm test && cat package.json',
      'pnpm test | cat package.json -',
      'source ./setup.sh && pnpm test',
    ];
    for (const command of commands) {
      const streamed = compactStream(output, detectCategory(command));
      expect(streamed.changed, command).toBe(false);
      expect(streamed.preview.content, command).toBe(output);
      expect(streamed.preview.content, command).toContain('DEPLOY_TARGET=production');
      expect(streamed.preview.content, command).toContain('"version": "1.2.3"');
    }
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

  it('keeps a warning line when it compacts passing tests', () => {
    const source = [
      'warning: deprecated API at src/main.ts:12',
      '✓ passing test one',
      '✓ passing test two',
      '1 passed',
    ].join('\n');

    const candidate = compactTestOutput(source);
    expect(candidate).not.toBeNull();
    expect(candidate).toContain('warning: deprecated API at src/main.ts:12');
    expect(candidate).toContain('1 passed');
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

    // The rule drops nothing here, so the source is already the candidate.
    const candidate = compactGitOutput(source) ?? source;
    for (const path of ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts', 'src/f.ts', 'src/g.ts']) {
      expect(candidate).toContain(path);
    }
  });

  it('keeps both porcelain status columns', () => {
    const source = [
      'MM src/staged-and-unstaged.ts',
      'AM src/added-then-edited.ts',
      'RM src/renamed-then-edited.ts',
      ' M src/only-unstaged.ts',
      '(use "git add <file>..." to update what will be committed)',
    ].join('\n');

    const candidate = compactGitOutput(source);
    expect(candidate).not.toBeNull();
    // Both columns survive, so unstaged work is visible.
    expect(candidate).toContain('MM src/staged-and-unstaged.ts');
    expect(candidate).toContain('AM src/added-then-edited.ts');
    expect(candidate).toContain('RM src/renamed-then-edited.ts');
    expect(candidate).toContain(' M src/only-unstaged.ts');
    expect(candidate).not.toContain('(use "git add');
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

  it('keeps a permission error line verbatim', () => {
    const path = 'src/components/very/long/path/file.ts';
    const source = [
      'rg: private.txt: Permission denied',
      ...Array.from({ length: 12 }, (_, index) => `${path}:${index + 1}:const value${index} = ${index}`),
    ].join('\n');

    const candidate = groupSearchOutput(source);
    expect(candidate).not.toBeNull();
    expect(candidate).toContain('rg: private.txt: Permission denied');
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

describe('compactStream', () => {
  it('counts the complete candidate and bounds the preview in one pass', () => {
    const source = [
      'warning: deprecated API at src/main.ts:12',
      ...Array.from({ length: 3000 }, (_, index) => `✓ passing ${index}`),
      'Tests: 1 passed',
    ].join('\n');
    const stringCandidate = compactTestOutput(source);
    expect(stringCandidate).not.toBeNull();

    const streamed = compactStream(source, 'test', { maxLines: 10, maxBytes: 1024 });
    expect(streamed.candidateBytes).toBe(Buffer.byteLength(stringCandidate as string, 'utf8'));
    expect(streamed.changed).toBe(true);
    expect(streamed.preview.truncated).toBe(false);
  });

  it('bounds the preview when the protected candidate alone is large', () => {
    const source = Array.from(
      { length: 3000 },
      (_, index) => `warning: deprecation ${index} at src/file-${index}.ts:1`,
    ).join('\n');

    const streamed = compactStream(source, 'test', { maxLines: 10, maxBytes: 1024 });
    expect(streamed.candidateBytes).toBe(Buffer.byteLength(source, 'utf8'));
    expect(streamed.preview.shownLines).toBeLessThanOrEqual(10);
    expect(streamed.preview.truncated).toBe(true);
    expect(streamed.preview.omittedLines).toBeGreaterThan(0);
  });

  it('leaves an unrecognised category unchanged', () => {
    const streamed = compactStream('plain text', 'none');
    expect(streamed.changed).toBe(false);
    expect(streamed.preview.content).toBe('plain text');
  });

  it('never empties search output that has no parseable matches', () => {
    const source = 'rg: private.txt: Permission denied\nno matches found';
    const streamed = compactStream(source, 'search');
    expect(streamed.preview.content).toBe(source);
    expect(streamed.candidateBytes).toBe(Buffer.byteLength(source, 'utf8'));
  });

  it('never empties lint output that has no parseable diagnostics', () => {
    const source = 'Nothing to lint today.';
    const streamed = compactStream(source, 'lint');
    expect(streamed.preview.content).toBe(source);
    expect(streamed.candidateBytes).toBe(Buffer.byteLength(source, 'utf8'));
  });

  it('keeps a coloured FAIL block and its context', () => {
    const source = [
      '\u001B[31mFAIL src/a.test.ts\u001B[0m',
      '  expected 1 to be 2',
      '\u001B[32m✓ pass\u001B[0m',
      '\u001B[31m1 failed\u001B[0m',
    ].join('\n');

    const streamed = compactStream(source, 'test', { maxLines: 1000, maxBytes: 1024 * 1024 });
    expect(streamed.preview.content).toContain('FAIL src/a.test.ts');
    expect(streamed.preview.content).toContain('expected 1 to be 2');
    expect(streamed.preview.content).toContain('1 failed');
    expect(streamed.preview.content).not.toContain('\u001B[');
  });

  it('keeps a warning and its file/line context', () => {
    const source = [
      'warning: deprecated API at src/main.ts:12',
      'src/main.ts:12:5 - error TS2322: Type mismatch',
      '✓ pass',
      '1 passed',
    ].join('\n');

    const streamed = compactStream(source, 'test', { maxLines: 1000, maxBytes: 1024 * 1024 });
    expect(streamed.preview.content).toContain('warning: deprecated API at src/main.ts:12');
    expect(streamed.preview.content).toContain('src/main.ts:12:5 - error TS2322: Type mismatch');
  });

  it('counts a leading blank line as a separator byte', () => {
    const source = '\n\na';
    const streamed = compactStream(source, 'none');
    expect(streamed.candidateBytes).toBe(Buffer.byteLength(source, 'utf8'));
  });

  it('keeps an unparsed warning alongside grouped lint diagnostics', () => {
    const diagnostics = Array.from(
      { length: 60 },
      (_, index) => `src/components/very/long/path/file.ts:${index + 1}:5: Unexpected any  [no-explicit-any]`,
    );
    const source = ['warning: configuration deprecated', ...diagnostics].join('\n');

    const streamed = compactStream(source, 'lint', { maxLines: 1000, maxBytes: 1024 * 1024 });
    expect(streamed.changed).toBe(true);
    expect(streamed.preview.content).toContain('warning: configuration deprecated');

    const candidate = compactLinterOutput(source);
    expect(candidate ?? source).toContain('warning: configuration deprecated');
  });

  it('marks the preview truncated exactly when the candidate exceeds the byte limit', () => {
    const source = `\n\n${'x'.repeat(1023)}`;
    expect(Buffer.byteLength(source, 'utf8')).toBe(1025);

    const over = compactStream(source, 'none', { maxLines: 100, maxBytes: 1024 });
    expect(over.candidateBytes).toBe(1025);
    expect(over.preview.truncated).toBe(true);

    const under = compactStream(source, 'none', { maxLines: 100, maxBytes: 1025 });
    expect(under.preview.truncated).toBe(false);
  });
});
