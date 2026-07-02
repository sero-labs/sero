/**
 * Git-repo-backed Loop Catalog store (see specs/14-loop-catalog.md).
 *
 * Cache layout under `$SERO_HOME/apps/orchestrator-catalog/` (resolved via
 * `appState.globalDir` — the plugin never hardcodes SERO_HOME):
 *   repos.json        — user-added repos (the official ref is constructed, not stored)
 *   fetch-state.json  — per-repo last successful fetch time
 *   repos/<key>/      — one shallow git clone per repo
 *
 * Git runs directly via execFile (the pull-request.ts shape). Fetches happen
 * strictly on demand — no timers, no polling. A failed fetch falls back to the
 * stale cache; a repo that was never fetched reports `root: null`.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AppRuntimeContext } from '@sero-ai/common';
import {
  catalogEntryMetaProblems,
  deriveRepoKey,
  isCatalogIndex,
  OFFICIAL_CATALOG_KEY,
  OFFICIAL_CATALOG_URL,
} from '../shared/catalog';
import type {
  CatalogEntry,
  CatalogEntryMeta,
  CatalogEntryProblem,
  CatalogRepoContents,
  CatalogRepoRef,
} from '../shared/catalog-types';
import type { CatalogStore } from './host';

const execFileAsync = promisify(execFile);

const CATALOG_NAMESPACE = 'orchestrator-catalog';
const CLONE_TIMEOUT_MS = 60_000;
const PULL_TIMEOUT_MS = 30_000;

interface RepoRegistry {
  version: 1;
  repos: { key: string; url: string; addedAt: string }[];
}

interface FetchState {
  version: 1;
  fetchedAt: Record<string, string>;
}

const officialRef = (): CatalogRepoRef => ({ key: OFFICIAL_CATALOG_KEY, url: OFFICIAL_CATALOG_URL, official: true });

async function git(args: string[], cwd: string | undefined, timeout: number): Promise<{ ok: boolean; reason?: string }> {
  try {
    // GIT_TERMINAL_PROMPT=0: a private repo without ambient credentials fails
    // fast with a clear error instead of hanging on a hidden prompt.
    await execFileAsync('git', args, { cwd, timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    return { ok: true };
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? '';
    const firstLine = stderr.split('\n').find((line) => line.trim() !== '');
    return { ok: false, reason: firstLine ?? (error instanceof Error ? error.message : String(error)) };
  }
}

async function readJson(file: string): Promise<unknown | undefined> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    return undefined; // missing — distinct from malformed
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null; // present but not JSON
  }
}

async function readOneEntry(
  cloneRoot: string,
  repoKey: string,
  slug: string,
): Promise<{ entry: CatalogEntry } | { problem: CatalogEntryProblem }> {
  // Containment chokepoint: a crafted slug ("../../x") can never resolve
  // outside the clone's loops/ tree (belt and braces with the slug format check).
  const base = path.join(cloneRoot, 'loops');
  const dir = path.resolve(base, slug);
  const rel = path.relative(base, dir);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    return { problem: { slug, reason: 'slug is not a plain directory name' } };
  }

  const rawMeta = await readJson(path.join(dir, 'catalog.json'));
  const metaProblems = catalogEntryMetaProblems(rawMeta);
  if (metaProblems.length > 0) return { problem: { slug, reason: metaProblems.join('; ') } };
  const meta = rawMeta as CatalogEntryMeta;
  if (meta.slug !== slug) return { problem: { slug, reason: `metadata slug ${JSON.stringify(meta.slug)} does not match` } };

  const definition = await readJson(path.join(dir, 'definition.json'));
  if (definition === undefined) return { problem: { slug, reason: 'definition.json is missing' } };
  if (definition === null || typeof definition !== 'object' || (definition as { schemaVersion?: unknown }).schemaVersion !== 1) {
    return { problem: { slug, reason: 'definition.json is malformed (expected schemaVersion 1)' } };
  }

  const entry: CatalogEntry = {
    repoKey,
    meta,
    definition: definition as CatalogEntry['definition'],
  };
  const exampleOutput = await readFile(path.join(dir, 'example-output.md'), 'utf8').catch(() => null);
  if (exampleOutput !== null) entry.exampleOutput = exampleOutput;
  return { entry };
}

export function createCatalogStore(ctx: AppRuntimeContext): CatalogStore {
  const { appState } = ctx.host;

  let rootPromise: Promise<string> | null = null;
  const root = () => (rootPromise ??= appState.globalDir(CATALOG_NAMESPACE).then((r) => r.path));

  const registryFile = async () => path.join(await root(), 'repos.json');
  const fetchStateFile = async () => path.join(await root(), 'fetch-state.json');
  const cloneDir = async (key: string) => {
    // Same containment discipline as the library store's entryDir.
    const base = path.join(await root(), 'repos');
    const dir = path.resolve(base, key);
    const rel = path.relative(base, dir);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`unsafe catalog repo key: ${JSON.stringify(key)}`);
    }
    return dir;
  };

  const readRegistry = async (): Promise<RepoRegistry> =>
    (await appState.read<RepoRegistry>(await registryFile())) ?? { version: 1, repos: [] };
  const readFetchState = async (): Promise<FetchState> =>
    (await appState.read<FetchState>(await fetchStateFile())) ?? { version: 1, fetchedAt: {} };

  const findRepo = async (key: string): Promise<CatalogRepoRef | null> => {
    if (key === OFFICIAL_CATALOG_KEY) return officialRef();
    const found = (await readRegistry()).repos.find((r) => r.key === key);
    return found ? { ...found, official: false } : null;
  };

  return {
    async listRepos() {
      const { fetchedAt } = await readFetchState();
      const added = (await readRegistry()).repos.map((r) => ({ ...r, official: false }));
      return [officialRef(), ...added].map((r) => (fetchedAt[r.key] ? { ...r, lastFetchedAt: fetchedAt[r.key] } : r));
    },

    async addRepo(url) {
      const trimmed = url.trim();
      if (!/^(https?|file):\/\/\S+$/i.test(trimmed) && !/^git@\S+$/i.test(trimmed)) {
        throw new Error(`not a usable git URL: ${JSON.stringify(url)}`);
      }
      const registry = await readRegistry();
      if (trimmed === OFFICIAL_CATALOG_URL || registry.repos.some((r) => r.url === trimmed)) {
        throw new Error('that catalog repo is already configured');
      }
      const repo = {
        key: deriveRepoKey(trimmed, new Set(registry.repos.map((r) => r.key))),
        url: trimmed,
        addedAt: new Date().toISOString(),
      };
      await appState.update<RepoRegistry>(await registryFile(), (current) => ({
        version: 1,
        repos: [...(current?.repos ?? []), repo],
      }));
      return { ...repo, official: false };
    },

    async removeRepo(key) {
      if (key === OFFICIAL_CATALOG_KEY) throw new Error('the official catalog cannot be removed');
      await appState.update<RepoRegistry>(await registryFile(), (current) => ({
        version: 1,
        repos: (current?.repos ?? []).filter((r) => r.key !== key),
      }));
      await appState.update<FetchState>(await fetchStateFile(), (current) => {
        const fetchedAt = { ...(current?.fetchedAt ?? {}) };
        delete fetchedAt[key];
        return { version: 1, fetchedAt };
      });
      // The clone cache goes too; installed loops own their library copies.
      await rm(await cloneDir(key), { recursive: true, force: true });
    },

    async refresh(key) {
      const repo = await findRepo(key);
      if (!repo) return { root: null, stale: false, reason: `unknown catalog repo: ${key}` };
      const dir = await cloneDir(key);
      const hasClone = existsSync(path.join(dir, '.git'));
      const result = hasClone
        ? await git(['pull', '--ff-only'], dir, PULL_TIMEOUT_MS)
        : await git(['clone', '--depth', '1', repo.url, dir], undefined, CLONE_TIMEOUT_MS);
      if (!result.ok) {
        const { fetchedAt } = await readFetchState();
        return hasClone
          ? { root: dir, stale: true, reason: result.reason, lastFetchedAt: fetchedAt[key] }
          : { root: null, stale: false, reason: result.reason };
      }
      const lastFetchedAt = new Date().toISOString();
      await appState.update<FetchState>(await fetchStateFile(), (current) => ({
        version: 1,
        fetchedAt: { ...(current?.fetchedAt ?? {}), [key]: lastFetchedAt },
      }));
      return { root: dir, stale: false, lastFetchedAt };
    },

    async readContents(key) {
      const repo = await findRepo(key);
      if (!repo) throw new Error(`unknown catalog repo: ${key}`);
      const { fetchedAt } = await readFetchState();
      const withFetched: CatalogRepoRef = fetchedAt[key] ? { ...repo, lastFetchedAt: fetchedAt[key] } : repo;
      const empty: CatalogRepoContents = { repo: withFetched, index: null, entries: [], problems: [] };

      const dir = await cloneDir(key);
      if (!existsSync(path.join(dir, '.git'))) return empty; // never fetched
      const rawIndex = await readJson(path.join(dir, 'catalog.json'));
      if (rawIndex === undefined) return empty; // fetched, but the repo has no index yet
      if (!isCatalogIndex(rawIndex)) {
        return { ...empty, problems: [{ slug: '', reason: 'catalog.json is malformed' }] };
      }

      const entries: CatalogEntry[] = [];
      const problems: CatalogEntryProblem[] = [];
      for (const slug of rawIndex.entries) {
        const read = await readOneEntry(dir, key, slug);
        if ('entry' in read) entries.push(read.entry);
        else problems.push(read.problem);
      }
      return { repo: withFetched, index: rawIndex, entries, problems };
    },

    async readEntry(key, slug) {
      const repo = await findRepo(key);
      if (!repo) return null;
      const dir = await cloneDir(key);
      if (!existsSync(path.join(dir, '.git'))) return null;
      const read = await readOneEntry(dir, key, slug);
      return 'entry' in read ? read.entry : null;
    },
  };
}
