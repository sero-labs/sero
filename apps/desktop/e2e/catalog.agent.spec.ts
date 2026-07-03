/**
 * Loop Catalog end-to-end (spec 14): the whole feature in the REAL app —
 * official entries out of the box, third-party repos behind one confirmation,
 * install → planner-adapted linked draft (never active), update flow through
 * the existing library machinery, fail-soft on repo removal, and a live pass
 * installing + running the official Daily note.
 *
 * Real-home only (the adaptation planner needs the app's own login):
 *   pnpm build   (repo root — plugin UI/runtime are their own build)
 *   SERO_E2E_REAL_HOME=1 npx playwright test e2e/catalog.agent.spec.ts --project=agent
 *
 * The third-party catalog is a LOCAL file:// git repo this spec owns, so
 * add/refresh/update/remove are deterministic; only the official-repo tests
 * touch the network. Screenshots land in e2e/screenshots/catalog/.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, launchSeroApp, workspace as workspaceSel } from './helpers';
import { waitForShell, createWorkspaceDir } from './helpers/workflow';

const REAL_HOME = process.env.SERO_E2E_REAL_HOME === '1';
const SHOTS = path.resolve(__dirname, 'screenshots', 'catalog');

let app: ElectronApplication;
let page: Page;
let wsDir: string;
let wsId: string;
let stateDir: string;
let libraryDir: string;
let fixtureRepoDir: string;

let fixtureLoopId: string;
let fixtureEntryId: string;

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

interface LoopFile {
  id: string;
  title: string;
  status: string;
  plan: { steps: { id: string }[] };
  libraryLink?: { entryId: string; version: number };
  runtime: {
    pendingInput?: { id: string; questions: { id: string; prompt: string; choices?: { id: string; label: string }[] }[] };
  };
}

interface LibraryIndexFile {
  entries: {
    id: string;
    name: string;
    latestVersion: number;
    catalog?: { repoKey: string; slug: string; catalogVersion: number; libraryVersion: number };
  }[];
}

interface OrchestratorIndex {
  loops: { id: string; status: string }[];
}

const loopFile = (id: string) => readJson<LoopFile>(path.join(stateDir, 'loops', id, 'loop.json'));
const libraryIndex = () => readJson<LibraryIndexFile>(path.join(libraryDir, 'index.json'));
const orchestratorIndex = () => readJson<OrchestratorIndex>(path.join(stateDir, 'index.json'));

const panel = () => page.locator('[data-app="orchestrator"]').first();
const entryCard = (repoKey: string, slug: string) => panel().locator(`[data-catalog-entry="${repoKey}/${slug}"]`);

async function shot(name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
}

async function invoke(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await page.evaluate(
    ({ workspaceId, toolParams }) =>
      window.sero.appAgent.invokeTool('orchestrator', workspaceId, 'orchestrator', toolParams),
    { workspaceId: wsId, toolParams: params },
  );
  return ((result as { details?: Record<string, unknown> })?.details ?? {}) as Record<string, unknown>;
}

function git(repoDir: string, args: string[]): void {
  execFileSync('git', ['-C', repoDir, '-c', 'user.email=e2e@sero.test', '-c', 'user.name=sero-e2e', ...args]);
}

/** A valid, tiny definition (same shape the store validates at install). */
function fixtureDefinition(summary: string): Record<string, unknown> {
  return {
    schemaVersion: 1,
    prompt: 'Write a tiny note file named fixture-note.md in this project with three bullets about what the project contains.',
    title: 'Fixture note',
    summary,
    plan: {
      schemaVersion: 1,
      revision: 0,
      objective: 'Write fixture-note.md with three bullets about the project',
      steps: [
        {
          id: 'write-note',
          title: 'Write the note',
          instructions:
            'Create or overwrite fixture-note.md in the workspace with three short bullets about what this project contains. Then emit the completion signal with status complete.',
          expectedOutcome: 'fixture-note.md exists with three bullets',
          execution: { type: 'background-agent', model: 'LOW' },
        },
      ],
    },
    triggers: [{ type: 'manual' }],
    limits: { maxAttemptsPerStep: 2, maxAttemptsTotal: 10, maxConcurrentSteps: 1, maxWallClockMs: 600000 },
    logPolicy: { retainRuns: 10, retainArtifacts: true, maxInlineOutputBytes: 8000, retainDigests: 10 },
    delivery: { destination: 'workspace-files' },
  };
}

function writeFixtureEntry(slug: string, meta: Record<string, unknown>, definition: Record<string, unknown>): void {
  const dir = path.join(fixtureRepoDir, 'loops', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'catalog.json'), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(dir, 'definition.json'), JSON.stringify(definition, null, 2));
}

function findRegisteredWorkspace(seroHome: string): { id: string; path: string } | null {
  const profilesDir = path.join(seroHome, 'profiles');
  const profileNames = fs.existsSync(profilesDir) ? fs.readdirSync(profilesDir) : [];
  const registries = [
    ...profileNames.map((name) => path.join(profilesDir, name, 'agent', 'workspaces.json')),
    path.join(seroHome, 'agent', 'workspaces.json'),
  ];
  for (const registry of registries) {
    const parsed = readJson<{ workspaces?: { id: string; path: string }[] }>(registry);
    for (const entry of parsed?.workspaces ?? []) {
      if (entry?.path?.includes('catalog-e2e') && fs.existsSync(entry.path)) return entry;
    }
  }
  return null;
}

test.describe.configure({ mode: 'serial' });
test.skip(!REAL_HOME, 'catalog e2e runs against the real app: SERO_E2E_REAL_HOME=1');

test.beforeAll(async () => {
  test.setTimeout(180_000);
  fs.mkdirSync(SHOTS, { recursive: true });

  // The spec's own third-party catalog: a local git repo with one good entry,
  // one entry whose definition is broken, and one ghost slug.
  fixtureRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-fixture-'));
  execFileSync('git', ['init', '-q', '-b', 'main', fixtureRepoDir]);
  fs.writeFileSync(
    path.join(fixtureRepoDir, 'catalog.json'),
    JSON.stringify({ version: 1, name: 'E2E fixture catalog', entries: ['fixture-note', 'bad-plan', 'ghost'] }),
  );
  writeFixtureEntry(
    'fixture-note',
    { slug: 'fixture-note', name: 'Fixture note', description: 'writes one tiny note', version: 1, costBand: 'low' },
    fixtureDefinition('Writes one tiny note about the project.'),
  );
  writeFixtureEntry(
    'bad-plan',
    { slug: 'bad-plan', name: 'Bad plan', description: 'definition is invalid on purpose', version: 1 },
    { ...fixtureDefinition('Broken.'), plan: { schemaVersion: 1, revision: 0, objective: 'broken', steps: [] } },
  );
  git(fixtureRepoDir, ['add', '--all']);
  git(fixtureRepoDir, ['commit', '-q', '-m', 'seed']);

  const seroHome = path.join(os.homedir(), '.sero-ui');
  const existing = findRegisteredWorkspace(seroHome);
  if (existing) {
    wsDir = existing.path;
    wsId = existing.id;
    fs.rmSync(path.join(wsDir, '.sero'), { recursive: true, force: true });
    fs.rmSync(path.join(wsDir, 'notes'), { recursive: true, force: true }); // stale daily notes would satisfy the live poll
    for (const stale of fs.readdirSync(wsDir)) {
      if (stale.endsWith('.md') && stale !== 'README.md') fs.rmSync(path.join(wsDir, stale), { force: true });
    }
  } else {
    wsDir = createWorkspaceDir(path.join(seroHome, 'workspaces'), `catalog-e2e-${Date.now()}`, {
      'README.md': [
        '# Catalog e2e scratch project',
        '',
        'A tiny pretend project with a parser and a CLI. Used to verify the Loop Catalog.',
      ].join('\n'),
    });
    wsId = '';
  }
  stateDir = path.join(wsDir, '.sero', 'apps', 'orchestrator');

  ({ app, page } = await launchSeroApp({ seroHome, runtime: 'host', env: {} }));
  await waitForShell(page);

  if (!wsId) {
    const ws = await page.evaluate(async ({ folderPath, name }) => {
      const created = await window.sero.workspace.addFolder(folderPath, name);
      window.dispatchEvent(new Event('sero:workspace-changed'));
      return created;
    }, { folderPath: wsDir, name: 'Catalog e2e' });
    wsId = ws.id;
  }
  await page.locator(workspaceSel.nodeById(wsId)).click();
  await expect
    .poll(() => page.evaluate(() => window.sero.layout.load()), { timeout: 10_000 })
    .toMatchObject({ activeWorkspaceId: wsId });
  const opened = await page.evaluate(() => Boolean(window.__appControl?.openApp('orchestrator')));
  expect(opened).toBe(true);
  await expect(panel()).toBeVisible({ timeout: 20_000 });

  libraryDir = String((await invoke({ action: 'library_list' })).libraryDir ?? '');
  expect(libraryDir).toBeTruthy();

  // Leftovers from earlier runs: drop stale fixture repos and their library entries.
  const listed = await invoke({ action: 'catalog_list' });
  for (const repo of (listed.catalogRepos as { key: string; url: string; official: boolean }[] | undefined) ?? []) {
    if (!repo.official && repo.url.includes('catalog-fixture')) await invoke({ action: 'catalog_remove_repo', repoKey: repo.key });
  }
  for (const entry of libraryIndex()?.entries ?? []) {
    if (entry.name === 'Fixture note' || entry.name === 'Daily note') await invoke({ action: 'library_delete', entryId: entry.id });
  }
});

test.afterAll(async () => {
  try {
    await closeSeroApp(app);
  } finally {
    fs.rmSync(fixtureRepoDir, { recursive: true, force: true });
  }
});

test('the official catalog shows the launch loops out of the box, verified', async () => {
  test.setTimeout(180_000);
  await panel().getByTitle('Browse and load saved loops').click();
  await panel().getByRole('button', { name: 'Catalog' }).click();

  // Opening the tab is the fetch: the official six arrive from the network.
  await expect(entryCard('official', 'daily-note')).toBeVisible({ timeout: 120_000 });
  await expect(entryCard('official', 'daily-note').getByText('Verified')).toBeVisible();
  await expect(entryCard('official', 'inbox-to-brief')).toBeVisible();
  await shot('01-official-catalog.png');
});

test('adding a third-party repo takes one confirmation and shows its origin', async () => {
  test.setTimeout(120_000);
  await panel().getByRole('button', { name: 'Add repo' }).click();
  await expect(page.getByText('not reviewed by Sero')).toBeVisible();
  await page.getByPlaceholder('https://github.com/your-org/your-catalog.git').fill(`file://${fixtureRepoDir}`);
  await page.getByRole('button', { name: 'Add this catalog' }).click();

  const card = panel().locator('[data-catalog-entry$="/fixture-note"]');
  await expect(card).toBeVisible({ timeout: 60_000 });
  // Third-party origin chip (the repo key), never the Verified badge.
  await expect(card.getByText('Verified')).toHaveCount(0);
  // The broken + ghost entries are hidden with reasons, siblings visible.
  await expect(panel().getByText(/entr\(ies\) hidden/)).toBeVisible();
  await shot('02-third-party-repo.png');
});

test('installing adapts the loop to this workspace as a linked draft — never active', async () => {
  test.setTimeout(600_000);
  const card = panel().locator('[data-catalog-entry$="/fixture-note"]');
  await card.getByRole('button', { name: 'Install' }).click();

  // Install navigates to the new draft's detail once adaptation lands.
  await expect
    .poll(() => orchestratorIndex()?.loops.length ?? 0, { timeout: 300_000, intervals: [3_000] })
    .toBeGreaterThan(0);
  fixtureLoopId = orchestratorIndex()!.loops.at(-1)!.id;
  const loop = () => loopFile(fixtureLoopId);
  await expect.poll(() => loop()?.status ?? '', { timeout: 300_000, intervals: [3_000] }).toMatch(/draft/);

  expect(loop()?.libraryLink).toMatchObject({ version: 1 });
  fixtureEntryId = loop()!.libraryLink!.entryId;
  const entry = libraryIndex()?.entries.find((e) => e.id === fixtureEntryId);
  expect(entry?.catalog).toMatchObject({ slug: 'fixture-note', catalogVersion: 1, libraryVersion: 1 });
  expect(loop()?.plan.steps.length).toBeGreaterThan(0);
  // Installs NEVER auto-activate.
  expect(orchestratorIndex()?.loops.find((l) => l.id === fixtureLoopId)?.status).not.toBe('active');
  await shot('03-installed-draft.png');
});

test('a broken catalog definition blocks with errors and writes nothing', async () => {
  test.setTimeout(120_000);
  const before = libraryIndex()?.entries.length ?? 0;
  const res = await invoke({ action: 'catalog_install', repoKey: 'nonexistent', slug: 'nope' });
  expect(res.ok).toBe(false);

  // The bad-plan entry is listed in the fixture index but hidden as malformed
  // (empty plan) — installing it by force reports the validation problem.
  const repos = (await invoke({ action: 'catalog_list' })).catalogRepos as { key: string; official: boolean }[];
  const fixtureKey = repos.find((r) => !r.official)!.key;
  const bad = await invoke({ action: 'catalog_install', repoKey: fixtureKey, slug: 'bad-plan' });
  expect(bad.ok).toBe(false);
  expect(libraryIndex()?.entries.length ?? 0).toBe(before);
});

test('a newer catalog version flows to the installed loop through the library', async () => {
  test.setTimeout(300_000);
  writeFixtureEntry(
    'fixture-note',
    { slug: 'fixture-note', name: 'Fixture note', description: 'writes one tiny note, now improved', version: 2, costBand: 'low' },
    fixtureDefinition('Writes one tiny improved note about the project.'),
  );
  git(fixtureRepoDir, ['add', '--all']);
  git(fixtureRepoDir, ['commit', '-q', '-m', 'v2']);

  // Re-opening the Catalog tab IS the on-demand pull (the install left us on
  // the draft detail) — the appended library version follows from it alone.
  await panel().getByTitle('Browse and load saved loops').click();
  await panel().getByRole('button', { name: 'Catalog' }).click();
  await expect
    .poll(() => libraryIndex()?.entries.find((e) => e.id === fixtureEntryId)?.latestVersion ?? 0, {
      timeout: 60_000,
      intervals: [2_000],
    })
    .toBe(2);
  expect(libraryIndex()?.entries.find((e) => e.id === fixtureEntryId)?.catalog).toMatchObject({
    catalogVersion: 2,
    libraryVersion: 2,
  });

  // The installed loop shows the update with the catalog-flavored choice, and
  // the plain switch moves it to v2 through the existing machinery. The loop's
  // display title is planner-authored, so navigate by the real one.
  const title = loopFile(fixtureLoopId)!.title;
  await panel().getByRole('button', { name: 'Home' }).click();
  await panel().getByText(title).first().click();
  await expect(panel().getByRole('button', { name: /Update & re-adapt to v2/ })).toBeVisible({ timeout: 30_000 });
  await shot('04-update-and-readapt.png');
  await panel().getByRole('button', { name: 'Update to v2', exact: true }).click();
  await expect
    .poll(() => loopFile(fixtureLoopId)?.libraryLink?.version ?? 0, { timeout: 30_000 })
    .toBe(2);
});

test('removing the repo never touches the installed loop or its library copy', async () => {
  test.setTimeout(120_000);
  const repos = (await invoke({ action: 'catalog_list' })).catalogRepos as { key: string; official: boolean }[];
  const fixtureKey = repos.find((r) => !r.official)!.key;
  const removed = await invoke({ action: 'catalog_remove_repo', repoKey: fixtureKey });
  expect(removed.ok).toBe(true);

  expect(loopFile(fixtureLoopId)?.libraryLink?.version).toBe(2);
  expect(libraryIndex()?.entries.find((e) => e.id === fixtureEntryId)).toBeTruthy();
  const refresh = await invoke({ action: 'catalog_refresh' });
  expect(refresh.ok).toBe(true);
});

test('live official pass: install Daily note, activate, and the note actually appears', async () => {
  test.setTimeout(900_000);
  const installed = await invoke({ action: 'catalog_install', repoKey: 'official', slug: 'daily-note' });
  expect(installed.ok, String(installed.error ?? '')).not.toBe(false);
  const loopId = (installed.loop as { id: string }).id;
  expect((installed.loop as { status: string }).status).toBe('draft');

  // Daily note delivers workspace files, so it instantiates at the workspace
  // ROOT (the placement fix this spec found). A dirty git root would park
  // activation on the "how should this run?" choice — commit first so the
  // preflight has nothing to ask about.
  if (fs.existsSync(path.join(wsDir, '.git'))) {
    git(wsDir, ['add', '--all']);
    try {
      git(wsDir, ['commit', '-q', '-m', 'e2e: pre-activation snapshot']);
    } catch {
      /* nothing to commit — already clean */
    }
  }

  const activated = await invoke({ action: 'activate', loopId });
  expect(activated.ok, String(activated.error ?? '')).not.toBe(false);

  // Belt and braces: if the dirty-workspace choice parked anyway, answer it
  // ourselves ("run here") instead of waiting on a human.
  const parked = loopFile(loopId)?.runtime.pendingInput;
  if (parked && /uncommitted change/i.test(parked.questions[0]?.prompt ?? '')) {
    const question = parked.questions[0];
    const choice =
      question.choices?.find((c) => /don't ask again/i.test(c.label)) ??
      question.choices?.find((c) => /run here/i.test(c.label));
    expect(choice, `no run-here choice among: ${JSON.stringify(question.choices)}`).toBeTruthy();
    const answered = await invoke({
      action: 'answer_input',
      loopId,
      requestId: parked.id,
      answersJson: JSON.stringify([{ questionId: question.id, choiceId: choice!.id }]),
    });
    expect(answered.ok, String(answered.error ?? '')).not.toBe(false);
  }

  // The first pass runs on activation (cron loop): the shipped content must
  // really work — today's note lands in the workspace.
  await expect
    .poll(() => {
      const dir = path.join(wsDir, 'notes', 'daily');
      return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).length : 0;
    }, { timeout: 600_000, intervals: [5_000] })
    .toBeGreaterThan(0);
  await shot('05-daily-note-artifact.png');

  await invoke({ action: 'delete', loopId });
  const entry = libraryIndex()?.entries.find((e) => e.catalog?.slug === 'daily-note');
  if (entry) await invoke({ action: 'library_delete', entryId: entry.id });
});

test('cleanup: delete the fixture loop and library entry', async () => {
  test.setTimeout(60_000);
  await invoke({ action: 'delete', loopId: fixtureLoopId });
  await invoke({ action: 'library_delete', entryId: fixtureEntryId });
  await expect
    .poll(() => orchestratorIndex()?.loops.length ?? -1, { timeout: 15_000 })
    .toBe(0);
});
