import { mkdtemp, rm, utimes, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CACHE_SCHEMA_VERSION, emptyScanCache, loadScanCache, saveScanCache, scanWithCache } from '../scan-cache';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'usage-cache-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeSessionFile(name: string, sessionId: string): Promise<string> {
  const filePath = path.join(dir, name);
  await writeFile(
    filePath,
    [
      JSON.stringify({ type: 'session', id: sessionId, cwd: '/w', timestamp: '2026-07-08T09:00:00.000Z' }),
      JSON.stringify({
        type: 'message',
        message: {
          role: 'assistant',
          provider: 'anthropic',
          model: 'claude-opus-4-5',
          timestamp: 1751960460000,
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0.1 } },
        },
      }),
    ].join('\n'),
  );
  return filePath;
}

describe('scanWithCache', () => {
  it('parses fresh files, then reuses them while fingerprints are unchanged', async () => {
    const fileA = await writeSessionFile('a.jsonl', 'sess-a');
    const fileB = await writeSessionFile('b.jsonl', 'sess-b');

    const first = await scanWithCache([fileA, fileB], emptyScanCache());
    expect(first.files).toBe(2);
    expect(first.reused).toBe(0);
    expect(first.sessions.map((s) => s.sessionId)).toEqual(['sess-a', 'sess-b']);

    const second = await scanWithCache([fileA, fileB], first.cache);
    expect(second.reused).toBe(2);
    expect(second.sessions.map((s) => s.sessionId)).toEqual(['sess-a', 'sess-b']);
  });

  it('re-parses when mtime or size changes', async () => {
    const fileA = await writeSessionFile('a.jsonl', 'sess-a');
    const first = await scanWithCache([fileA], emptyScanCache());

    await writeSessionFile('a.jsonl', 'sess-a-rewritten');
    await utimes(fileA, new Date(), new Date());
    const second = await scanWithCache([fileA], first.cache);

    expect(second.reused).toBe(0);
    expect(second.sessions[0]!.sessionId).toBe('sess-a-rewritten');
  });

  it('drops deleted files from the next cache', async () => {
    const fileA = await writeSessionFile('a.jsonl', 'sess-a');
    const first = await scanWithCache([fileA], emptyScanCache());
    expect(Object.keys(first.cache.files)).toEqual([fileA]);

    const second = await scanWithCache([], first.cache);
    expect(Object.keys(second.cache.files)).toEqual([]);
  });
});

describe('cache persistence', () => {
  it('round-trips through disk atomically', async () => {
    const cachePath = path.join(dir, 'scan-cache.json');
    const fileA = await writeSessionFile('a.jsonl', 'sess-a');
    const { cache } = await scanWithCache([fileA], emptyScanCache());

    await saveScanCache(cachePath, cache);
    const loaded = await loadScanCache(cachePath);
    expect(loaded).toEqual(cache);
    expect(JSON.parse(await readFile(cachePath, 'utf8')).schemaVersion).toBe(CACHE_SCHEMA_VERSION);
  });

  it('starts empty on missing, corrupt, or version-mismatched cache files', async () => {
    const cachePath = path.join(dir, 'scan-cache.json');
    expect(await loadScanCache(cachePath)).toEqual(emptyScanCache());

    await writeFile(cachePath, 'not json');
    expect(await loadScanCache(cachePath)).toEqual(emptyScanCache());

    await writeFile(cachePath, JSON.stringify({ schemaVersion: 999, files: {} }));
    expect(await loadScanCache(cachePath)).toEqual(emptyScanCache());
  });
});
