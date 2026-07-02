import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AppRuntimeContext } from '@sero-ai/common';
import { catalogEntryMetaProblems, deriveRepoKey, OFFICIAL_CATALOG_KEY, OFFICIAL_CATALOG_URL } from '../../shared/catalog';
import { createCatalogStore } from '../catalog-store';

const execFileAsync = promisify(execFile);

let dir: string;
let fixtures: string[];

/** Minimal AppRuntimeContext whose appState hits real files and globalDir points at `dir`. */
function makeCtx(): AppRuntimeContext {
  const appState = {
    read: async (file: string) => {
      try {
        return JSON.parse(await readFile(file, 'utf8'));
      } catch {
        return null;
      }
    },
    update: async (file: string, updater: (current: unknown) => unknown) => {
      let current: unknown = null;
      try {
        current = JSON.parse(await readFile(file, 'utf8'));
      } catch {
        /* missing — fine */
      }
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(updater(current)), 'utf8');
    },
    globalDir: async (namespace: string) => ({ path: path.join(dir, namespace) }),
  };
  return { host: { appState } } as unknown as AppRuntimeContext;
}

const validMeta = (slug: string, version = 1) => ({
  slug,
  name: `Loop ${slug}`,
  description: `does ${slug} things`,
  version,
});

const validDefinition = () => ({
  schemaVersion: 1,
  prompt: 'do the thing',
  title: 'Thing',
  summary: 'does the thing',
  plan: { objective: 'thing', steps: [] },
  triggers: [],
  limits: {},
  logPolicy: {},
});

async function inRepo(repoDir: string, args: string[]): Promise<void> {
  await execFileAsync('git', ['-C', repoDir, '-c', 'user.email=t@t.t', '-c', 'user.name=t', ...args]);
}

async function commitAll(repoDir: string, message: string): Promise<void> {
  await inRepo(repoDir, ['add', '--all']);
  await inRepo(repoDir, ['commit', '-q', '-m', message]);
}

async function writeEntry(repoDir: string, slug: string, meta: unknown, definition: unknown = validDefinition()): Promise<void> {
  const entryDir = path.join(repoDir, 'loops', slug);
  await mkdir(entryDir, { recursive: true });
  await writeFile(path.join(entryDir, 'catalog.json'), JSON.stringify(meta));
  await writeFile(path.join(entryDir, 'definition.json'), JSON.stringify(definition));
}

async function makeFixtureRepo(slugs: string[]): Promise<string> {
  const repoDir = await mkdtemp(path.join(tmpdir(), 'orch-cat-fixture-'));
  fixtures.push(repoDir);
  await execFileAsync('git', ['init', '-q', '-b', 'main', repoDir]);
  await writeFile(path.join(repoDir, 'catalog.json'), JSON.stringify({ version: 1, name: 'Fixture', entries: slugs }));
  for (const slug of slugs) await writeEntry(repoDir, slug, validMeta(slug));
  await commitAll(repoDir, 'seed');
  return repoDir;
}

const fileUrl = (repoDir: string) => `file://${repoDir}`;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'orch-cat-'));
  fixtures = [];
});
afterEach(async () => {
  for (const fixture of [dir, ...fixtures]) await rm(fixture, { recursive: true, force: true });
});

describe('repo registry', () => {
  it('lists the official repo first, out of the box, and keeps added repos after it', async () => {
    const store = createCatalogStore(makeCtx());
    expect(await store.listRepos()).toEqual([{ key: OFFICIAL_CATALOG_KEY, url: OFFICIAL_CATALOG_URL, official: true }]);

    const added = await store.addRepo('https://example.com/acme/loops.git');
    expect(added).toMatchObject({ key: 'example-com-acme-loops', official: false });
    const repos = await store.listRepos();
    expect(repos.map((r) => r.key)).toEqual([OFFICIAL_CATALOG_KEY, 'example-com-acme-loops']);
  });

  it('rejects non-git URLs, duplicates, and re-adding the official repo', async () => {
    const store = createCatalogStore(makeCtx());
    await expect(store.addRepo('not a url')).rejects.toThrow(/not a usable git URL/);
    await store.addRepo('https://example.com/acme/loops.git');
    await expect(store.addRepo('https://example.com/acme/loops.git')).rejects.toThrow(/already configured/);
    await expect(store.addRepo(OFFICIAL_CATALOG_URL)).rejects.toThrow(/already configured/);
  });

  it('never removes the official repo, and removing an added repo drops its cache', async () => {
    const store = createCatalogStore(makeCtx());
    await expect(store.removeRepo(OFFICIAL_CATALOG_KEY)).rejects.toThrow(/cannot be removed/);

    const repoDir = await makeFixtureRepo(['alpha']);
    const { key } = await store.addRepo(fileUrl(repoDir));
    await store.refresh(key);
    expect((await store.readContents(key)).entries).toHaveLength(1);

    await store.removeRepo(key);
    expect((await store.listRepos()).map((r) => r.key)).toEqual([OFFICIAL_CATALOG_KEY]);
    await expect(store.readContents(key)).rejects.toThrow(/unknown catalog repo/);
  });
});

describe('deriveRepoKey', () => {
  it('slugs URLs deterministically and suffixes collisions', () => {
    expect(deriveRepoKey('https://github.com/Acme/Loops.git', new Set())).toBe('github-com-acme-loops');
    expect(deriveRepoKey('git@github.com:acme/loops.git', new Set())).toBe('github-com-acme-loops');
    expect(deriveRepoKey('https://github.com/acme/loops', new Set(['github-com-acme-loops']))).toBe('github-com-acme-loops-2');
  });

  it('never produces the reserved official key', () => {
    expect(deriveRepoKey('https://official/', new Set())).not.toBe(OFFICIAL_CATALOG_KEY);
  });
});

describe('refresh + readContents', () => {
  it('clones on first refresh, then pulls new commits on later refreshes', async () => {
    const store = createCatalogStore(makeCtx());
    const repoDir = await makeFixtureRepo(['alpha']);
    const { key } = await store.addRepo(fileUrl(repoDir));

    expect((await store.readContents(key)).index).toBeNull(); // never fetched
    const first = await store.refresh(key);
    expect(first.stale).toBe(false);
    expect(first.root).toBeTruthy();
    expect(first.lastFetchedAt).toBeTruthy();
    expect((await store.readContents(key)).entries.map((e) => e.meta.slug)).toEqual(['alpha']);

    await writeEntry(repoDir, 'beta', validMeta('beta'));
    await writeFile(path.join(repoDir, 'catalog.json'), JSON.stringify({ version: 1, name: 'Fixture', entries: ['alpha', 'beta'] }));
    await commitAll(repoDir, 'add beta');
    await store.refresh(key);
    expect((await store.readContents(key)).entries.map((e) => e.meta.slug)).toEqual(['alpha', 'beta']);
  });

  it('reports never-fetched vs stale-cache failures distinctly', async () => {
    const store = createCatalogStore(makeCtx());
    const missing = await store.addRepo('file:///nowhere/does-not-exist');
    const neverFetched = await store.refresh(missing.key);
    expect(neverFetched).toMatchObject({ root: null, stale: false });
    expect(neverFetched.reason).toBeTruthy();

    const repoDir = await makeFixtureRepo(['alpha']);
    const { key } = await store.addRepo(fileUrl(repoDir));
    await store.refresh(key);
    await rename(repoDir, `${repoDir}-moved`); // upstream vanishes
    fixtures.push(`${repoDir}-moved`);
    const stale = await store.refresh(key);
    expect(stale.stale).toBe(true);
    expect(stale.root).toBeTruthy();
    expect(stale.reason).toBeTruthy();
    // The stale cache still serves the last-fetched contents.
    expect((await store.readContents(key)).entries.map((e) => e.meta.slug)).toEqual(['alpha']);
  });

  it('hides a malformed entry with a reason while siblings stay visible', async () => {
    const store = createCatalogStore(makeCtx());
    const repoDir = await makeFixtureRepo(['alpha']);
    await writeEntry(repoDir, 'broken', { slug: 'broken', name: '', description: 'x', version: 0 });
    await writeFile(
      path.join(repoDir, 'catalog.json'),
      JSON.stringify({ version: 1, name: 'Fixture', entries: ['alpha', 'broken', 'ghost', '../evil'] }),
    );
    await commitAll(repoDir, 'add broken entries');
    const { key } = await store.addRepo(fileUrl(repoDir));
    await store.refresh(key);

    const contents = await store.readContents(key);
    expect(contents.entries.map((e) => e.meta.slug)).toEqual(['alpha']);
    expect(contents.problems.map((p) => p.slug).sort()).toEqual(['../evil', 'broken', 'ghost']);
    expect(contents.problems.find((p) => p.slug === '../evil')?.reason).toMatch(/plain directory name/);
    expect(await store.readEntry(key, 'alpha')).toMatchObject({ repoKey: key, meta: { slug: 'alpha' } });
    expect(await store.readEntry(key, 'broken')).toBeNull();
  });

  it('treats a repo without catalog.json (e.g. freshly created) as fetched-but-empty', async () => {
    const store = createCatalogStore(makeCtx());
    const repoDir = await mkdtemp(path.join(tmpdir(), 'orch-cat-fixture-'));
    fixtures.push(repoDir);
    await execFileAsync('git', ['init', '-q', '-b', 'main', repoDir]);
    await writeFile(path.join(repoDir, 'README.md'), 'soon');
    await commitAll(repoDir, 'init');

    const { key } = await store.addRepo(fileUrl(repoDir));
    await store.refresh(key);
    expect(await store.readContents(key)).toMatchObject({ index: null, entries: [], problems: [] });
  });
});

describe('catalogEntryMetaProblems', () => {
  it('accepts full valid metadata and rejects each malformed field with a reason', () => {
    expect(
      catalogEntryMetaProblems({
        ...validMeta('ci-fixer'),
        requiredTools: ['mcp'],
        connectors: ['GitHub (gh login)'],
        recommendedTrigger: 'fires on github:ci-failed',
        delivery: 'pr',
        costBand: 'medium',
        modelTier: 'MED',
        limitations: 'only public repos',
      }),
    ).toEqual([]);
    expect(catalogEntryMetaProblems(null)).toEqual(['catalog.json is not an object']);
    expect(catalogEntryMetaProblems({ ...validMeta('x'), slug: 'Bad Slug' })).toEqual([expect.stringMatching(/slug must match/)]);
    expect(catalogEntryMetaProblems({ ...validMeta('x'), version: 1.5 })).toEqual(['version must be a positive integer']);
    expect(catalogEntryMetaProblems({ ...validMeta('x'), delivery: 'carrier-pigeon' })).toEqual(['unknown delivery destination']);
    expect(catalogEntryMetaProblems({ ...validMeta('x'), costBand: 'free' })).toEqual(['costBand must be low | medium | high']);
    expect(catalogEntryMetaProblems({ ...validMeta('x'), requiredTools: 'mcp' })).toEqual(['requiredTools must be a string array']);
  });
});
