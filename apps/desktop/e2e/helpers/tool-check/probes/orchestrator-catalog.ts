/**
 * The loop catalog: a local git repository stands in for a team's catalog
 * repo. The probe adds it, fetches it, installs its one entry, publishes a
 * second version, fetches again and removes the repo. The official GitHub
 * catalog is never touched: every refresh names the repo.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expectOk, expectText } from '../expect';
import type { ScenarioStep, StepContext } from '../types';
import { fileExists, must, readJson } from './cron-memory-support';
import { CATALOG_STEP_ID } from './orchestrator-plans';
import { readLibraryIndex } from './orchestrator-library';
import { catalogDir, CATALOG, idFromText, loopIdOf, readLoop, saveLoopId } from './orchestrator-support';

const SLUG = 'tc-orch-note';
export const CATALOG_PROMPT = `${CATALOG}: tidy the notes folder.`;

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.email=probe@example.com', '-c', 'user.name=Probe', ...args], { cwd, stdio: 'ignore' });
}

/** Writes version `version` of the catalog's one entry and commits it. */
function publish(dir: string, version: number): void {
  const entryDir = path.join(dir, 'loops', SLUG);
  fs.mkdirSync(entryDir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'catalog.json'), JSON.stringify({ version: 1, name: 'tc catalog', entries: [SLUG] }));
  fs.writeFileSync(path.join(entryDir, 'catalog.json'), JSON.stringify({
    slug: SLUG,
    name: 'TC note loop',
    description: `Tidies the notes folder (version ${version}).`,
    version,
  }));
  fs.writeFileSync(path.join(entryDir, 'definition.json'), JSON.stringify({
    schemaVersion: 1,
    prompt: CATALOG_PROMPT,
    title: 'TC note loop',
    summary: `Tidies the notes folder (version ${version}).`,
    plan: {
      schemaVersion: 1,
      revision: 0,
      objective: 'Tidy the notes',
      steps: [{
        id: CATALOG_STEP_ID,
        title: 'Tidy the notes',
        instructions: `${CATALOG}: tidy the notes folder.`,
        execution: { type: 'background-agent', model: 'LOW' },
      }],
    },
    triggers: [],
    limits: { maxAttemptsPerStep: 3 },
    logPolicy: { retainRuns: 20, retainArtifacts: true, maxInlineOutputBytes: 8000 },
  }));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-m', `version ${version}`);
}

function createCatalogRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-tool-check-catalog-'));
  git(dir, 'init', '-q', '-b', 'main');
  publish(dir, 1);
  return dir;
}

function repoDir(ctx: StepContext): string {
  const dir = ctx.state['orchestrator:catalogRepo'];
  must(typeof dir === 'string', 'no catalog repository was made');
  return dir;
}

function repoKey(ctx: StepContext): string {
  const key = ctx.state['orchestrator:catalogKey'];
  must(typeof key === 'string', 'no catalog repo key was saved');
  return key;
}

interface ReposFile {
  repos: Array<{ key: string; url: string }>;
}

async function readRepos(ctx: StepContext): Promise<ReposFile['repos']> {
  return (await readJson<ReposFile>(path.join(await catalogDir(ctx), 'repos.json')))?.repos ?? [];
}

/** The `<repos> catalog repo(s), <entries> entr(ies)` line `catalog_list` prints. */
function parseCatalogList(text: string): { repos: number; entries: number } {
  const match = /(\d+) catalog repo\(s\), (\d+) entr\(ies\)/.exec(text);
  must(match, `catalog_list said: ${text}`);
  return { repos: Number(match[1]), entries: Number(match[2]) };
}

export const catalogSteps: ScenarioStep[] = [
  {
    // Only the official repo, which the profile never fetches, so it holds no entries.
    action: 'catalog_list',
    setup: async (ctx) => {
      ctx.state['orchestrator:catalogRepo'] = createCatalogRepo();
    },
    params: { action: 'catalog_list' },
    async expect(result, ctx) {
      expectOk(result);
      const listed = parseCatalogList(result.text);
      must(listed.repos === 1 + (await readRepos(ctx)).length && listed.entries === 0, `the first catalog list said: ${result.text}`);
    },
  },
  {
    action: 'catalog_add_repo',
    params: (ctx) => ({ action: 'catalog_add_repo', url: pathToFileURL(repoDir(ctx)).href }),
    async expect(result, ctx) {
      const url = pathToFileURL(repoDir(ctx)).href;
      expectText(result, `Added catalog repo ${url}`);
      const added = (await readRepos(ctx)).find((repo) => repo.url === url);
      must(added, 'the repo is not in the profile\'s catalog list');
      ctx.state['orchestrator:catalogKey'] = added.key;
    },
  },
  {
    action: 'catalog_refresh',
    params: (ctx) => ({ action: 'catalog_refresh', repoKey: repoKey(ctx) }),
    timeoutMs: 90_000,
    async expect(result, ctx) {
      expectText(result, 'Refreshed 1 catalog repo(s).');
      const root = await catalogDir(ctx);
      must(await fileExists(path.join(root, 'repos', repoKey(ctx), 'loops', SLUG, 'definition.json')), 'the repo was not cloned into the catalog cache');
      const fetched = await readJson<{ fetchedAt: Record<string, string> }>(path.join(root, 'fetch-state.json'));
      must(fetched?.fetchedAt[repoKey(ctx)], 'no fetch time was recorded for the repo');
    },
  },
  {
    action: 'catalog_list',
    params: { action: 'catalog_list' },
    async expect(result, ctx) {
      expectOk(result);
      const listed = parseCatalogList(result.text);
      must(listed.repos === 1 + (await readRepos(ctx)).length && listed.entries === 1, `the catalog list after a fetch said: ${result.text}`);
    },
  },
  {
    // Installing lands the entry in the library as version 1 and plans a draft loop from its definition.
    action: 'catalog_install',
    params: (ctx) => ({ action: 'catalog_install', repoKey: repoKey(ctx), slug: SLUG }),
    timeoutMs: 120_000,
    async expect(result, ctx) {
      expectText(result, 'Installed "tc-orch catalog loop" as a draft loop ');
      const id = idFromText(result, /as a draft loop (\S+) —/);
      saveLoopId(ctx, 'catalog', id);
      const entry = (await readLibraryIndex(ctx)).entries.find((candidate) => candidate.catalog?.slug === SLUG);
      must(entry?.latestVersion === 1 && entry.catalog?.catalogVersion === 1, `the library holds ${JSON.stringify(entry)}`);
      ctx.state['orchestrator:catalogEntry'] = entry.id;
      const loop = await readLoop(ctx, id);
      must(loop.status === 'draft' && loop.libraryLink?.entryId === entry.id, `the installed loop is ${loop.status}, ${JSON.stringify(loop.libraryLink)}`);
      must(loop.plan.steps[0]?.id === CATALOG_STEP_ID, 'the installed loop has no plan');
    },
  },
  {
    // A newer version in the repo becomes the next library version of the installed entry.
    action: 'catalog_refresh',
    setup: async (ctx) => publish(repoDir(ctx), 2),
    params: (ctx) => ({ action: 'catalog_refresh', repoKey: repoKey(ctx) }),
    timeoutMs: 90_000,
    async expect(result, ctx) {
      expectText(result, '1 installed loop(s) have a new version available.');
      const entry = (await readLibraryIndex(ctx)).entries.find((candidate) => candidate.id === ctx.state['orchestrator:catalogEntry']);
      must(entry?.latestVersion === 2 && entry.catalog?.catalogVersion === 2, `the library holds ${JSON.stringify(entry)}`);
    },
  },
  {
    // The installed loop and its library copy outlive the repo.
    action: 'catalog_remove_repo',
    params: (ctx) => ({ action: 'catalog_remove_repo', repoKey: repoKey(ctx) }),
    async expect(result, ctx) {
      try {
        expectText(result, `Removed catalog repo ${repoKey(ctx)}`);
        must(!(await readRepos(ctx)).some((repo) => repo.key === repoKey(ctx)), 'the repo is still in the profile\'s catalog list');
        must(!(await fileExists(path.join(await catalogDir(ctx), 'repos', repoKey(ctx)))), 'the cached clone is still on disk');
        must((await readLoop(ctx, loopIdOf(ctx, 'catalog'))).libraryLink, 'removing the repo unlinked the installed loop');
        must((await readLibraryIndex(ctx)).entries.some((entry) => entry.id === ctx.state['orchestrator:catalogEntry']), 'removing the repo deleted the installed library entry');
      } finally {
        await fsp.rm(repoDir(ctx), { recursive: true, force: true });
      }
    },
  },
];
