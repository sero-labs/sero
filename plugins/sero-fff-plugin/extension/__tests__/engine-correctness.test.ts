/**
 * Correctness of the indexed engine against `rg`, on a real fixture tree.
 *
 * These run the native FFF library, so they are skipped when the platform
 * binary or `rg` is missing rather than failing the suite on that machine.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { FileFinderApi } from '@ff-labs/fff-node';

import { FinderRegistry } from '../registry';
import { resetFinderSdkCache, loadFinderSdk } from '../sdk';

const FILE_COUNT = 12;
const MATCHES_PER_FILE = 3;
const TOKEN = 'UniqueMarkerToken';

function hasRipgrep(): boolean {
  try {
    execFileSync('rg', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function ripgrepMatches(root: string, token: string): string[] {
  const stdout = execFileSync('rg', ['--no-heading', '--line-number', '--color', 'never', token, '.'], {
    cwd: root,
    encoding: 'utf8',
  });
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [file, lineNumber] = line.split(':');
      return `${file.replace(/^\.\//, '')}:${lineNumber}`;
    })
    .sort();
}

function buildFixture(): string {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'sero-fff-engine-')));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  for (let index = 0; index < FILE_COUNT; index += 1) {
    const lines: string[] = [];
    for (let line = 0; line < 10; line += 1) {
      lines.push(line % 4 === 1 ? `const value = ${TOKEN}${index};` : `// filler ${line}`);
    }
    fs.writeFileSync(path.join(root, 'src', `module-${index}.ts`), `${lines.join('\n')}\n`);
  }
  // Naming variants of one identifier, for the multi-pattern pass.
  fs.writeFileSync(path.join(root, 'src', 'variant-pascal.ts'), 'export class VideoFrameHandler {}\n');
  fs.writeFileSync(path.join(root, 'src', 'variant-snake.ts'), 'def video_frame_handler():\n    pass\n');
  return root;
}

let root: string;
let finder: FileFinderApi | null = null;
let registry: FinderRegistry;
let available = false;

beforeAll(async () => {
  resetFinderSdkCache();
  const sdk = await loadFinderSdk();
  available = sdk.ok && hasRipgrep();
  if (!available) return;

  root = buildFixture();
  registry = new FinderRegistry({
    dbPaths: {
      frecency: path.join(root, '.fff', 'frecency'),
      history: path.join(root, '.fff', 'history'),
    },
  });
  finder = await registry.acquire({ root, consumerId: 'engine-test' });
}, 60_000);

afterAll(() => {
  if (registry) registry.releaseAll('engine-test');
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

describe.runIf(process.env.SERO_FFF_SKIP_ENGINE_TESTS !== '1')('indexed grep against rg', () => {
  it('finds exactly the matches rg finds when the page covers them all', () => {
    if (!available) return;
    const expected = ripgrepMatches(root, TOKEN);
    expect(expected).toHaveLength(FILE_COUNT * MATCHES_PER_FILE);

    const result = finder!.grep(TOKEN, { mode: 'plain', pageSize: 200, maxMatchesPerFile: 200 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const actual = result.value.items
      .map((item) => `${item.relativePath}:${item.lineNumber}`)
      .sort();
    expect(actual).toEqual(expected);
  });

  it('returns the same complete set when walked page by page', () => {
    if (!available) return;
    const expected = ripgrepMatches(root, TOKEN);

    const seen: string[] = [];
    let cursor = null as Parameters<FileFinderApi['grep']>[1] extends { cursor?: infer C } ? C : never;
    let pages = 0;
    do {
      const page = finder!.grep(TOKEN, {
        mode: 'plain',
        pageSize: 5,
        maxMatchesPerFile: 200,
        cursor,
      });
      expect(page.ok).toBe(true);
      if (!page.ok) return;
      seen.push(...page.value.items.map((item) => `${item.relativePath}:${item.lineNumber}`));
      cursor = page.value.nextCursor;
      pages += 1;
    } while (cursor && pages < 50);

    expect(pages).toBeGreaterThan(1);
    expect([...new Set(seen)].sort()).toEqual(expected);
  });

  it('documents the non-exhaustive contract: one page is a ranked subset', () => {
    if (!available) return;
    const expected = ripgrepMatches(root, TOKEN);

    const page = finder!.grep(TOKEN, { mode: 'plain', pageSize: 5, maxMatchesPerFile: 200 });
    expect(page.ok).toBe(true);
    if (!page.ok) return;

    // The point of the guidance in the tool descriptions: a bounded page is a
    // strict subset, so an audit that needs every occurrence must use rg.
    expect(page.value.items.length).toBeLessThan(expected.length);
    expect(page.value.nextCursor).not.toBeNull();
    for (const item of page.value.items) {
      expect(expected).toContain(`${item.relativePath}:${item.lineNumber}`);
    }
  });

  it('finds files by fuzzy path the way rg -g does by glob', () => {
    if (!available) return;
    const result = finder!.fileSearch('src/ module-3.ts', { pageSize: 20 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.items.map((item) => item.relativePath)).toContain('src/module-3.ts');
  });

  it('matches every naming variant in one multi_grep pass', () => {
    if (!available) return;
    const result = finder!.multiGrep({
      patterns: ['VideoFrameHandler', 'video_frame_handler'],
      pageSize: 200,
      maxMatchesPerFile: 200,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const files = new Set(result.value.items.map((item) => item.relativePath));
    expect(files).toEqual(new Set(['src/variant-pascal.ts', 'src/variant-snake.ts']));
  });
});
