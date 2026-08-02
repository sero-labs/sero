/**
 * The bake service: what lands on disk, and that the cache actually short-
 * circuits. The cache test proves the second call READ the first bake rather
 * than re-running it, by poisoning the stored report — a hit returns the
 * poison, a silent re-bake would return the truth and pass vacuously.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../../../shared/paths';
import { puppetBakeDir } from '../../shared/paths';
import { REPORT_FILE, REST_FILE, bakePuppetSource, puppetSourceHash, readReviewPngs, stripFile } from './bake';
import { CLEAN_SOURCE, SYNTAX_ERROR_SOURCE } from './fixtures';

let home = '';
let paths: DesignLibraryPaths;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'puppet-bake-'));
  paths = designLibraryPathsFromHome(home);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('bakePuppetSource', () => {
  it('writes the bake whole: source, report, rest, one strip per clip', async () => {
    const outcome = await bakePuppetSource(paths, CLEAN_SOURCE);
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues));
    expect(outcome.cached).toBe(false);
    expect(outcome.report.allClean).toBe(true);
    expect(outcome.report.clips.map((clip) => clip.clip)).toEqual(['idle']);
    expect(outcome.report.pretty).toContain('ok');

    const stored = JSON.parse(await readFile(path.join(outcome.dir, REPORT_FILE), 'utf8'));
    expect(stored.allClean).toBe(true);
    const rest = await readFile(path.join(outcome.dir, REST_FILE));
    expect(rest.subarray(1, 4).toString('ascii')).toBe('PNG');
    const strip = await readFile(stripFile(outcome.dir, 'idle'));
    expect(strip.subarray(1, 4).toString('ascii')).toBe('PNG');

    const images = await readReviewPngs(outcome.dir, outcome.report);
    expect(images.strips.get('idle')?.equals(strip)).toBe(true);
  });

  it('hits the cache on the same source and misses on a changed one', async () => {
    const first = await bakePuppetSource(paths, CLEAN_SOURCE);
    if (!first.ok) throw new Error('first bake failed');

    const reportPath = path.join(puppetBakeDir(paths, first.hash), REPORT_FILE);
    const poisoned = JSON.parse(await readFile(reportPath, 'utf8'));
    poisoned.bakeMs = -1;
    await writeFile(reportPath, JSON.stringify(poisoned), 'utf8');

    const second = await bakePuppetSource(paths, CLEAN_SOURCE);
    if (!second.ok) throw new Error('cache hit failed');
    expect(second.cached).toBe(true);
    expect(second.report.bakeMs).toBe(-1);

    const changed = await bakePuppetSource(paths, `${CLEAN_SOURCE}\n// changed\n`);
    if (!changed.ok) throw new Error('changed source failed');
    expect(changed.cached).toBe(false);
    expect(changed.hash).not.toBe(first.hash);
  });

  it('rejects a cache from another format or engine and rebakes', async () => {
    const first = await bakePuppetSource(paths, CLEAN_SOURCE);
    if (!first.ok) throw new Error('first bake failed');
    const reportPath = path.join(puppetBakeDir(paths, first.hash), REPORT_FILE);
    const stored = JSON.parse(await readFile(reportPath, 'utf8'));
    stored.version = 999;
    await writeFile(reportPath, JSON.stringify(stored), 'utf8');

    const second = await bakePuppetSource(paths, CLEAN_SOURCE);
    if (!second.ok) throw new Error('rebake failed');
    expect(second.cached).toBe(false);
    expect(second.report.version).not.toBe(999);
  });

  it('rejects a cache whose strips are missing and rebakes', async () => {
    const first = await bakePuppetSource(paths, CLEAN_SOURCE);
    if (!first.ok) throw new Error('first bake failed');
    await rm(stripFile(puppetBakeDir(paths, first.hash), 'idle'));

    const second = await bakePuppetSource(paths, CLEAN_SOURCE);
    if (!second.ok) throw new Error('rebake failed');
    expect(second.cached).toBe(false);
    await readFile(stripFile(puppetBakeDir(paths, first.hash), 'idle'));
  });

  it('recomputes the convergence signal from the checks, never the stored flag', async () => {
    const first = await bakePuppetSource(paths, CLEAN_SOURCE);
    if (!first.ok) throw new Error('first bake failed');
    const reportPath = path.join(puppetBakeDir(paths, first.hash), REPORT_FILE);
    const stored = JSON.parse(await readFile(reportPath, 'utf8'));
    stored.allClean = false; // a lie — every check still reads ok
    await writeFile(reportPath, JSON.stringify(stored), 'utf8');

    const second = await bakePuppetSource(paths, CLEAN_SOURCE);
    if (!second.ok) throw new Error('cache hit failed');
    expect(second.cached).toBe(true);
    expect(second.report.allClean).toBe(true);
  });

  it('rejects a cached clip whose gate set is empty — nothing proven is not clean', async () => {
    const first = await bakePuppetSource(paths, CLEAN_SOURCE);
    if (!first.ok) throw new Error('first bake failed');
    const reportPath = path.join(puppetBakeDir(paths, first.hash), REPORT_FILE);
    const stored = JSON.parse(await readFile(reportPath, 'utf8'));
    stored.clips[0].checks = [];
    await writeFile(reportPath, JSON.stringify(stored), 'utf8');

    const second = await bakePuppetSource(paths, CLEAN_SOURCE);
    if (!second.ok) throw new Error('rebake failed');
    expect(second.cached).toBe(false);
    expect(second.report.clips[0].checks.length).toBeGreaterThan(0);
  });

  it('does not cache a failure', async () => {
    const first = await bakePuppetSource(paths, SYNTAX_ERROR_SOURCE);
    expect(first.ok).toBe(false);
    const hash = puppetSourceHash(SYNTAX_ERROR_SOURCE);
    await expect(readFile(path.join(puppetBakeDir(paths, hash), REPORT_FILE))).rejects.toThrow();
  });
});
