import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FinderRegistry } from '../registry';
import { resetFinderSdkCache, setFinderSdkForTesting } from '../sdk';
import { SearchContext } from '../search-context';
import { registerFindTool } from '../tools/find';
import { registerGrepTool } from '../tools/grep';
import { registerMultiGrepTool } from '../tools/multi-grep';
import {
  createFakeSdk,
  fakeCursor,
  grepMatch,
  grepResult,
  searchResult,
  type FakeFinderScript,
} from './fixtures/fake-finder';
import { createToolHost, type ToolHost } from './fixtures/harness';

const DB_PATHS = { frecency: '/profile/fff/frecency', history: '/profile/fff/history' };

let workspace: string;

function setup(script: FakeFinderScript = {}): {
  host: ToolHost;
  sdk: ReturnType<typeof createFakeSdk>;
} {
  const sdk = createFakeSdk({ script });
  setFinderSdkForTesting({ ok: true, FileFinder: sdk.FileFinder });
  const search = new SearchContext(new FinderRegistry({ dbPaths: DB_PATHS }));
  const host = createToolHost();
  registerFindTool(host.pi, search);
  registerGrepTool(host.pi, search);
  registerMultiGrepTool(host.pi, search);
  return { host, sdk };
}

beforeEach(() => {
  workspace = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'sero-fff-')));
});

afterEach(() => {
  resetFinderSdkCache();
  fs.rmSync(workspace, { recursive: true, force: true });
});

describe('tool registration', () => {
  it('registers the three conventional search tool names', () => {
    const { host } = setup();
    expect([...host.tools.keys()].sort()).toEqual(['find', 'grep', 'multi_grep']);
  });

  it('tells the model that results are ranked, not exhaustive', () => {
    const { host } = setup();
    for (const name of ['find', 'grep', 'multi_grep']) {
      const definition = host.tools.get(name)!.definition;
      expect(definition.description).toMatch(/not exhaustive/i);
      expect(definition.promptGuidelines?.join(' ')).toMatch(/rg/);
    }
  });
});

describe('workspace confinement', () => {
  it('refuses an absolute path outside the workspace', async () => {
    const { host } = setup();
    await expect(host.tools.get('grep')!.call({ pattern: 'x', path: '/etc' }, workspace))
      .rejects.toThrow(/outside this session's workspace root/);
  });

  it('refuses a parent-traversal path', async () => {
    const { host } = setup();
    await expect(host.tools.get('find')!.call({ pattern: 'x', path: '../elsewhere' }, workspace))
      .rejects.toThrow(/outside this session's workspace root/);
  });

  it('refuses a home-relative path', async () => {
    const { host } = setup();
    await expect(host.tools.get('multi_grep')!.call({ patterns: ['x'], path: '~/projects' }, workspace))
      .rejects.toThrow(/outside this session's workspace root/);
  });

  it('rebases an absolute path that is inside the workspace', async () => {
    const { host, sdk } = setup();
    await host.tools.get('grep')!.call({ pattern: 'x', path: path.join(workspace, 'src') }, workspace);

    expect(sdk.created[0].calls[0].args[0]).toBe('src/ x');
  });

  it('indexes the session cwd and nothing above it', async () => {
    const { host, sdk } = setup();
    await host.tools.get('grep')!.call({ pattern: 'x' }, workspace);

    expect(sdk.initOptions[0].basePath).toBe(workspace);
  });
});

describe('grep', () => {
  it('groups output by file and reports engine totals', async () => {
    const { host } = setup({
      grep: () => ({
        ok: true,
        value: grepResult([
          grepMatch({ relativePath: 'src/a.ts', lineNumber: 4, lineContent: 'const a = 1;' }),
          grepMatch({ relativePath: 'src/b.ts', lineNumber: 7, lineContent: 'const b = 2;' }),
        ]),
      }),
    });

    const result = await host.tools.get('grep')!.call({ pattern: 'const' }, workspace);

    expect(result.text).toContain('src/a.ts\n 4: const a = 1;');
    expect(result.text).toContain('src/b.ts\n 7: const b = 2;');
    expect(result.details.totalMatched).toBe(2);
  });

  it('caps the engine page at the requested limit', async () => {
    const { host, sdk } = setup();
    await host.tools.get('grep')!.call({ pattern: 'x', limit: 3 }, workspace);

    const options = sdk.created[0].calls[0].args[1] as { pageSize: number; maxMatchesPerFile: number };
    expect(options.pageSize).toBe(3);
    expect(options.maxMatchesPerFile).toBe(3);
  });

  it('never exceeds the engine page ceiling however large the limit', async () => {
    const { host, sdk } = setup();
    await host.tools.get('grep')!.call({ pattern: 'x', limit: 5000 }, workspace);

    expect((sdk.created[0].calls[0].args[1] as { pageSize: number }).pageSize).toBe(50);
  });

  it('hands back an opaque cursor and replays it on the next page', async () => {
    const cursor = fakeCursor(42);
    const { host, sdk } = setup({
      grep: (_query, options) => {
        const passed = (options as { cursor?: unknown }).cursor;
        return {
          ok: true,
          value: grepResult(
            [grepMatch({ relativePath: 'src/a.ts' })],
            passed ? null : cursor,
          ),
        };
      },
    });

    const first = await host.tools.get('grep')!.call({ pattern: 'x' }, workspace);
    const token = first.text.match(/cursor="([^"]+)"/)?.[1];
    expect(token).toBeDefined();
    expect(token).not.toContain('42');

    await host.tools.get('grep')!.call({ pattern: 'x', cursor: token }, workspace);
    expect((sdk.created[0].calls[1].args[1] as { cursor: unknown }).cursor).toBe(cursor);
  });

  it('falls back to fuzzy matching when an exhausted first page found nothing', async () => {
    const { host, sdk } = setup({
      grep: (_query, options) => {
        const mode = (options as { mode?: string }).mode;
        if (mode === 'fuzzy') {
          return { ok: true, value: grepResult([grepMatch({ relativePath: 'src/near.ts' })]) };
        }
        return { ok: true, value: grepResult([]) };
      },
    });

    const result = await host.tools.get('grep')!.call({ pattern: 'usestate' }, workspace);

    expect(result.text).toContain('0 exact matches');
    expect(result.text).toContain('src/near.ts');
    expect(sdk.created[0].calls).toHaveLength(2);
  });

  it('does not retry a regex query fuzzily', async () => {
    const { host, sdk } = setup({ grep: () => ({ ok: true, value: grepResult([]) }) });

    await host.tools.get('grep')!.call({ pattern: 'export (a|b)' }, workspace);

    expect(sdk.created[0].calls).toHaveLength(1);
    expect((sdk.created[0].calls[0].args[1] as { mode: string }).mode).toBe('regex');
  });

  it('does not retry a page reached through a cursor', async () => {
    const cursor = fakeCursor(1);
    const { host, sdk } = setup({
      grep: (_query, options) => ({
        ok: true,
        value: grepResult([], (options as { cursor?: unknown }).cursor ? null : cursor),
      }),
    });

    const first = await host.tools.get('grep')!.call({ pattern: 'x' }, workspace);
    const token = first.text.match(/cursor="([^"]+)"/)![1];
    await host.tools.get('grep')!.call({ pattern: 'x', cursor: token }, workspace);

    expect(sdk.created[0].calls).toHaveLength(2);
  });

  it('rejects a pattern that matches every line instead of searching', async () => {
    const { host, sdk } = setup();
    const result = await host.tools.get('grep')!.call({ pattern: '.*' }, workspace);

    expect(result.text).toContain('matches every line');
    expect(sdk.created).toHaveLength(0);
  });

  it('turns smart-case off when the caller forces case sensitivity', async () => {
    const { host, sdk } = setup();
    await host.tools.get('grep')!.call({ pattern: 'x', caseSensitive: true }, workspace);

    expect((sdk.created[0].calls[0].args[1] as { smartCase: boolean }).smartCase).toBe(false);
  });
});

describe('find', () => {
  it('lists matched paths with their annotations', async () => {
    const { host } = setup({ fileSearch: () => ({ ok: true, value: searchResult(['src/a.ts', 'src/b.ts']) }) });

    const result = await host.tools.get('find')!.call({ pattern: 'src' }, workspace);

    expect(result.text).toBe('src/a.ts\nsrc/b.ts');
  });

  it('offers a cursor when a full page leaves more matches behind', async () => {
    const { host, sdk } = setup({
      fileSearch: () => ({ ok: true, value: searchResult(['a.ts', 'b.ts'], 10) }),
    });

    const first = await host.tools.get('find')!.call({ pattern: 'ts', limit: 2 }, workspace);
    expect(first.text).toMatch(/8 more matches available/);
    expect(first.details.hasMore).toBe(true);

    const token = first.text.match(/cursor="([^"]+)"/)![1];
    const second = await host.tools.get('find')!.call({ pattern: 'ts', cursor: token }, workspace);

    expect(second.details.pageIndex).toBe(1);
    expect((sdk.created[0].calls[1].args[1] as { pageIndex: number }).pageIndex).toBe(1);
  });

  it('offers no cursor when the page exhausts the matches', async () => {
    const { host } = setup({ fileSearch: () => ({ ok: true, value: searchResult(['a.ts', 'b.ts'], 2) }) });

    const result = await host.tools.get('find')!.call({ pattern: 'ts', limit: 2 }, workspace);

    expect(result.text).not.toContain('cursor=');
    expect(result.details.hasMore).toBe(false);
  });

  it('caps and flags a page of weak fuzzy matches instead of dumping it', async () => {
    const paths = Array.from({ length: 30 }, (_, index) => `file-${index}.ts`);
    const { host } = setup({ fileSearch: () => ({ ok: true, value: searchResult(paths, 30, 1) }) });

    const result = await host.tools.get('find')!.call({ pattern: 'ComponentRegistry' }, workspace);

    expect(result.text).toMatch(/weak scattered matches/);
    expect(result.text.split('\n').filter((line) => line.startsWith('file-'))).toHaveLength(5);
  });
});

describe('multi_grep', () => {
  it('passes every pattern through in one call', async () => {
    const { host, sdk } = setup();
    await host.tools.get('multi_grep')!.call(
      { patterns: ['VideoFrame', 'video_frame'] },
      workspace,
    );

    expect((sdk.created[0].calls[0].args[0] as { patterns: string[] }).patterns)
      .toEqual(['VideoFrame', 'video_frame']);
  });

  it('sends path and exclude as engine constraints, not as a pattern', async () => {
    const { host, sdk } = setup();
    await host.tools.get('multi_grep')!.call(
      { patterns: ['x'], path: 'src', exclude: 'test/' },
      workspace,
    );

    expect((sdk.created[0].calls[0].args[0] as { constraints: string }).constraints)
      .toBe('src/ !test/');
  });

  it('rejects an empty pattern list', async () => {
    const { host } = setup();
    await expect(host.tools.get('multi_grep')!.call({ patterns: ['  '] }, workspace))
      .rejects.toThrow(/at least one non-empty pattern/);
  });

  it('rejects a pattern list large enough to flood the output', async () => {
    const { host } = setup();
    const patterns = Array.from({ length: 40 }, (_, index) => `p${index}`);

    await expect(host.tools.get('multi_grep')!.call({ patterns }, workspace))
      .rejects.toThrow(/at most 32 patterns/);
  });
});

describe('index failure', () => {
  it('directs the agent to the bash fallback when the index cannot be built', async () => {
    setFinderSdkForTesting({ ok: false, error: 'native library not found' });
    const search = new SearchContext(new FinderRegistry({ dbPaths: DB_PATHS }));
    const host = createToolHost();
    registerGrepTool(host.pi, search);

    await expect(host.tools.get('grep')!.call({ pattern: 'x' }, workspace))
      .rejects.toThrow(/Fall back to `bash` with `rg`/);
  });

  it('lets a session start even when the index cannot be built', async () => {
    setFinderSdkForTesting({ ok: false, error: 'native library not found' });
    const search = new SearchContext(new FinderRegistry({ dbPaths: DB_PATHS }));

    await expect(search.warm(workspace)).resolves.toMatchObject({ ok: false });
  });
});

describe('session lifecycle', () => {
  it('releases the shared index when the session shuts down', async () => {
    const sdk = createFakeSdk();
    setFinderSdkForTesting({ ok: true, FileFinder: sdk.FileFinder });
    const registry = new FinderRegistry({ dbPaths: DB_PATHS });
    const search = new SearchContext(registry);

    await search.warm(workspace);
    expect(registry.refCount(workspace)).toBe(1);

    search.release();
    expect(sdk.created[0].destroyed).toBe(true);
  });

  it('gives two sessions on one workspace the same index', async () => {
    const sdk = createFakeSdk();
    setFinderSdkForTesting({ ok: true, FileFinder: sdk.FileFinder });
    const registry = new FinderRegistry({ dbPaths: DB_PATHS });
    const chat = new SearchContext(registry);
    const subagent = new SearchContext(registry);

    await chat.warm(workspace);
    await subagent.warm(workspace);

    expect(sdk.created).toHaveLength(1);
    expect(registry.refCount(workspace)).toBe(2);

    chat.release();
    expect(sdk.created[0].destroyed).toBe(false);
  });
});

describe('non-workspace roots', () => {
  it('refuses to index the home directory', async () => {
    const { host } = setup();
    await expect(host.tools.get('grep')!.call({ pattern: 'x' }, os.homedir()))
      .rejects.toThrow(/not a workspace root/);
  });
});
