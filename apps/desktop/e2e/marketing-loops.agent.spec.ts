/**
 * Marketing growth loops end-to-end (growth plan task 2.6): the five local
 * draft loops under docs/marketing/loops/ run through the REAL orchestrator —
 * catalog install (planner adaptation included), activation, real triggers,
 * real background-agent runs against a clone of sero-labs/sero, real gh data.
 *
 * Real-home only (needs the app's model login and the developer's gh auth):
 *   pnpm build   (repo root — plugin UI/runtime are their own build)
 *   SERO_E2E_REAL_HOME=1 SERO_E2E_GH_LIVE=1 \
 *     npx playwright test e2e/marketing-loops.agent.spec.ts --project=agent
 *
 * SERO_E2E_GH_LIVE=1 additionally gates the proof-moment-miner event test: it
 * merges one tiny docs-only PR into sero-labs/sero main to produce a REAL
 * github:main-updated event (deploy.yml is path-filtered to apps/homepage,
 * apps/docs-site and pnpm-lock.yaml, so a docs-only push cannot deploy).
 *
 * The workspace is a scratch clone of sero-labs/sero on the campaign branch
 * under ~/.sero-ui/workspaces/. Loop outputs land in the clone's
 * docs/marketing/ and are committed locally (never pushed) between loops so
 * each activation preflights against a clean tree. Screenshots land in
 * e2e/screenshots/marketing-loops/. The mechanics live in
 * e2e/helpers/marketing-loops.ts.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, launchSeroApp, layout as layoutSel, workspace as workspaceSel } from './helpers';
import { waitForShell } from './helpers/workflow';
import {
  createMarketingLoopsHarness,
  git,
  gh,
  INBOX_SEED,
  prepareScratchWorkspace,
  readJson,
  SLUGS,
  stageCatalogFixture,
  type LoopFile,
  type MarketingLoopsHarness,
  type Slug,
} from './helpers/marketing-loops';

const REAL_HOME = process.env.SERO_E2E_REAL_HOME === '1';
const GH_LIVE = process.env.SERO_E2E_GH_LIVE === '1';
const SHOTS = path.resolve(__dirname, 'screenshots', 'marketing-loops');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const LOOPS_SRC = path.join(REPO_ROOT, 'docs', 'marketing', 'loops');
const REPO_SLUG = 'sero-labs/sero';
const CAMPAIGN_BRANCH = 'feat/sero-marketing-strategy';
const WS_MARKER = 'marketing-loops-e2e';

let app: ElectronApplication;
let page: Page;
let wsDir: string;
let stateDir: string;
let fixtureRepoDir: string;
let fixtureRepoKey: string;
let h: MarketingLoopsHarness;
const loopIds: Partial<Record<Slug, string>> = {};
let firePrNumber: string;

const panel = () => page.locator('[data-app="orchestrator"]').first();

test.describe.configure({ mode: 'serial' });
test.skip(!REAL_HOME, 'marketing loops e2e runs against the real app: SERO_E2E_REAL_HOME=1');

test.beforeAll(async () => {
  test.setTimeout(600_000);
  fs.mkdirSync(SHOTS, { recursive: true });

  fixtureRepoDir = stageCatalogFixture(LOOPS_SRC);

  const seroHome = path.join(os.homedir(), '.sero-ui');
  ({ wsDir, stateDir } = prepareScratchWorkspace({
    seroHome,
    marker: WS_MARKER,
    repoSlug: REPO_SLUG,
    branch: CAMPAIGN_BRANCH,
  }));

  // Seed the demo-script inbox (two entries = activation run + one manual run)
  // and checkpoint so the first activation sees a clean tree.
  fs.mkdirSync(path.join(wsDir, 'docs/marketing/demo-scripts'), { recursive: true });
  fs.writeFileSync(path.join(wsDir, 'docs/marketing/demo-scripts/inbox.md'), INBOX_SEED);
  git(wsDir, ['add', '--all']);
  git(wsDir, ['commit', '-q', '-m', 'e2e checkpoint: seed demo-scripts inbox']);

  // Poll github at the 60s floor so the miner's event fire lands in budget.
  fs.mkdirSync(path.join(stateDir, 'events'), { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'events', 'github.json'), JSON.stringify({ intervalMs: 60_000 }));

  ({ app, page } = await launchSeroApp({ seroHome, runtime: 'host', env: {} }));
  await waitForShell(page);

  const existingId = await page
    .evaluate(async (folder) => {
      const list = await window.sero.workspace.list();
      return list.find((w: { path: string }) => w.path === folder)?.id ?? null;
    }, wsDir)
    .catch(() => null);
  let wsId = existingId;
  if (!wsId) {
    const ws = await page.evaluate(
      async ({ folderPath, name }) => {
        const created = await window.sero.workspace.addFolder(folderPath, name);
        window.dispatchEvent(new Event('sero:workspace-changed'));
        return created;
      },
      { folderPath: wsDir, name: 'Marketing loops e2e' },
    );
    wsId = ws.id;
  }
  h = createMarketingLoopsHarness({ page, workspaceId: wsId, wsDir, stateDir, shotsDir: SHOTS });

  if (!(await page.locator(layoutSel.sidebarPanel).isVisible().catch(() => false))) {
    await page.locator(layoutSel.sidebarToggle).click();
  }
  await page.locator(workspaceSel.nodeById(wsId)).click();
  await expect
    .poll(() => page.evaluate(() => window.sero.layout.load()), { timeout: 10_000 })
    .toMatchObject({ activeWorkspaceId: wsId });
  const opened = await page.evaluate(() => Boolean(window.__appControl?.openApp('orchestrator')));
  expect(opened).toBe(true);
  await expect(panel()).toBeVisible({ timeout: 20_000 });

  // Drop stale fixture-catalog registrations from earlier runs.
  const listed = await h.invoke({ action: 'catalog_list' });
  for (const repo of (listed.catalogRepos as { key: string; url: string; official: boolean }[] | undefined) ?? []) {
    if (!repo.official && repo.url.includes('marketing-catalog')) {
      await h.invoke({ action: 'catalog_remove_repo', repoKey: repo.key });
    }
  }
});

test.afterAll(async () => {
  try {
    await closeSeroApp(app);
  } finally {
    fs.rmSync(fixtureRepoDir, { recursive: true, force: true });
  }
});

test('the five loop drafts install from a local catalog as drafts with their triggers intact', async () => {
  test.setTimeout(3_600_000);

  const added = await h.invoke({ action: 'catalog_add_repo', url: `file://${fixtureRepoDir}` });
  expect(added.ok, String(added.error ?? '')).not.toBe(false);
  const repos = (await h.invoke({ action: 'catalog_list' })).catalogRepos as {
    key: string;
    url: string;
    official: boolean;
  }[];
  fixtureRepoKey = repos.find((r) => !r.official && r.url.includes('marketing-catalog'))!.key;
  const refreshed = await h.invoke({ action: 'catalog_refresh', repoKey: fixtureRepoKey });
  expect(refreshed.ok, String(refreshed.error ?? '')).not.toBe(false);

  const expectedTrigger: Record<Slug, Partial<LoopFile['triggers'][number]>> = {
    'github-star-dashboard': { type: 'cron' },
    'demo-script-generator': { type: 'manual' },
    'community-digest': { type: 'cron' },
    'release-launch-pack': { type: 'cron' },
    'proof-moment-miner': { type: 'event', eventSource: 'github:main-updated' },
  };

  for (const slug of SLUGS) {
    const installed = await h.invoke({ action: 'catalog_install', repoKey: fixtureRepoKey, slug });
    expect(installed.ok, `${slug}: ${String(installed.error ?? '')}`).not.toBe(false);
    const loop = installed.loop as { id: string; status: string };
    expect(loop.status, `${slug} must land as a reviewable draft`).toBe('draft');
    loopIds[slug] = loop.id;

    // Planner adaptation must not lose the loop's substance: the trigger
    // shape survives and the plan still has its stages.
    const persisted = h.loopFile(loop.id)!;
    expect(persisted.triggers, `${slug} triggers after adaptation`).toEqual(
      expect.arrayContaining([expect.objectContaining(expectedTrigger[slug])]),
    );
    expect(persisted.plan.steps.length, `${slug} adapted plan steps`).toBeGreaterThanOrEqual(3);
    expect(persisted.runtime.pendingInput, `${slug} parked on a question during install`).toBeFalsy();
  }
  await h.shot('01-installed-drafts.png');
});

test('github-star-dashboard: activation runs the real daily pass and produces the dashboard', async () => {
  test.setTimeout(1_800_000);
  const id = loopIds['github-star-dashboard']!;

  const activated = await h.invoke({ action: 'activate', loopId: id });
  expect(activated.ok, String(activated.error ?? '')).not.toBe(false);
  const run = await h.waitRunSettled(id, (r) => r.runNumber === 1, 1_500_000);
  expect(run.status).toBe('completed');

  const history = fs.readFileSync(h.wsFile('docs/marketing/metrics/history.jsonl'), 'utf8').trim().split('\n');
  const today = JSON.parse(history.at(-1)!) as { stars: number; traffic: { available: boolean } };
  expect(today.stars).toBeGreaterThan(0);
  expect(readJson(h.wsFile('docs/marketing/metrics/traffic-days.json'))).toBeTruthy();
  const dashboard = fs.readFileSync(h.wsFile('docs/marketing/dashboard.md'), 'utf8');
  expect(dashboard).toContain('# Sero Growth Dashboard');
  expect(dashboard).toContain(String(today.stars));
  await h.shot('02-star-dashboard-run.png');

  const disabled = await h.invoke({ action: 'disable', loopId: id });
  expect(disabled.ok, String(disabled.error ?? '')).not.toBe(false);
  h.commitOutputs('github-star-dashboard outputs');
});

test('demo-script-generator: activation + a manual fire produce two grounded shot lists', async () => {
  test.setTimeout(2_400_000);
  const id = loopIds['demo-script-generator']!;

  const activated = await h.invoke({ action: 'activate', loopId: id });
  expect(activated.ok, String(activated.error ?? '')).not.toBe(false);
  const first = await h.waitRunSettled(id, (r) => r.runNumber === 1, 1_200_000);
  expect(first.status).toBe('completed');
  expect(h.listMd('docs/marketing/demo-scripts', ['inbox.md']).length).toBe(1);

  // Checkpoint before the second fire: a dirty workspace root makes the
  // preflight default (after its 30s notification times out) to a managed
  // worktree, where run 1's uncommitted inbox state is invisible.
  h.commitOutputs('demo-script-generator run 1');

  // A manual-only loop is non-recurring: once the pass settles the loop
  // completes, and the manual re-fire is `run_again` (restart from step 1).
  const fired = await h.invoke({ action: 'run_again', loopId: id });
  expect(fired.ok, String(fired.error ?? '')).not.toBe(false);
  const second = await h.waitRunSettled(id, (r) => r.runNumber === 2, 1_200_000);
  expect(second.status).toBe('completed');

  const scripts = h.listMd('docs/marketing/demo-scripts', ['inbox.md']);
  expect(scripts.length).toBe(2);
  for (const file of scripts) {
    const text = fs.readFileSync(h.wsFile(`docs/marketing/demo-scripts/${file}`), 'utf8');
    expect(text, `${file} must be a timed shot list`).toMatch(/0:0\d/);
    expect(text.toLowerCase(), `${file} must carry honest caveats`).toContain('caveat');
  }
  const inbox = fs.readFileSync(h.wsFile('docs/marketing/demo-scripts/inbox.md'), 'utf8');
  expect(inbox.split('## Processed')[1]).toMatch(/Durable Orchestrator loops|Sero builds itself a plugin/);
  await h.shot('03-demo-scripts.png');

  // A completed manual loop fires nothing on its own and cannot be disabled.
  if (h.loopFile(id)?.status === 'active') {
    const disabled = await h.invoke({ action: 'disable', loopId: id });
    expect(disabled.ok, String(disabled.error ?? '')).not.toBe(false);
  }
  h.commitOutputs('demo-script-generator outputs');
});

test('community-digest: activation runs the weekly pass and writes an honest digest', async () => {
  test.setTimeout(1_800_000);
  const id = loopIds['community-digest']!;

  const activated = await h.invoke({ action: 'activate', loopId: id });
  expect(activated.ok, String(activated.error ?? '')).not.toBe(false);
  const run = await h.waitRunSettled(id, (r) => r.runNumber === 1, 1_500_000);
  expect(run.status).toBe('completed');

  const digests = h.listMd('docs/marketing/community-digests');
  expect(digests.length).toBe(1);
  const digest = fs.readFileSync(h.wsFile(`docs/marketing/community-digests/${digests[0]}`), 'utf8');
  expect(digest.length).toBeGreaterThan(200);
  expect(digest).not.toMatch(/trapped in chat box/i);
  await h.shot('04-community-digest.png');

  const disabled = await h.invoke({ action: 'disable', loopId: id });
  expect(disabled.ok, String(disabled.error ?? '')).not.toBe(false);
  h.commitOutputs('community-digest outputs');
});

test('release-launch-pack: activation pass finds the latest product release and drafts the pack', async () => {
  test.setTimeout(3_000_000);
  const id = loopIds['release-launch-pack']!;

  const activated = await h.invoke({ action: 'activate', loopId: id });
  expect(activated.ok, String(activated.error ?? '')).not.toBe(false);
  const run = await h.waitRunSettled(id, (r) => r.runNumber === 1, 2_700_000);
  expect(run.status).toBe('completed');

  // The newest published PRODUCT release (Internal:-prefixed artifacts must be skipped).
  const packDirs = fs.existsSync(h.wsFile('docs/marketing/launch-packs'))
    ? fs.readdirSync(h.wsFile('docs/marketing/launch-packs')).filter((d) => !d.startsWith('.'))
    : [];
  expect(packDirs).toEqual(['v0.4.0-beta.0']);
  const pack = `docs/marketing/launch-packs/${packDirs[0]}`;
  for (const file of ['release-notes.md', 'x-thread.md', 'hn-draft.md', 'reddit-variants.md']) {
    const text = fs.readFileSync(h.wsFile(`${pack}/${file}`), 'utf8');
    expect(text, `${file} must be marked as a draft`).toMatch(/<!-- DRAFT/);
  }
  expect(fs.readFileSync(h.wsFile(`${pack}/hn-draft.md`), 'utf8')).toMatch(/Recommendation: (post|do NOT post)/);
  await h.shot('05-launch-pack.png');

  const disabled = await h.invoke({ action: 'disable', loopId: id });
  expect(disabled.ok, String(disabled.error ?? '')).not.toBe(false);
  h.commitOutputs('release-launch-pack outputs');
});

test('proof-moment-miner: arms on activation and a manual backlog run mines real merged PRs', async () => {
  test.setTimeout(3_600_000);
  const id = loopIds['proof-moment-miner']!;

  const activated = await h.invoke({ action: 'activate', loopId: id });
  expect(activated.ok, String(activated.error ?? '')).not.toBe(false);

  // Event-armed only: no eventless first pass (the spec-13 fix).
  expect(h.runsIndex(id)?.runs ?? []).toHaveLength(0);

  // The real github poller must come up against the developer's gh login.
  await expect
    .poll(
      () => readJson<{ lastPolledAt?: string }>(path.join(stateDir, 'events', 'github.json'))?.lastPolledAt ?? null,
      { timeout: 180_000, intervals: [5_000] },
    )
    .not.toBeNull();

  // Manual fire: a fresh pass with no event payload mines the recent
  // merged-PR backlog (the loop's catch-up path).
  const fired = await h.invoke({ action: 'run_next', loopId: id });
  expect(fired.ok, String(fired.error ?? '')).not.toBe(false);
  const run = await h.waitRunSettled(id, (r) => r.runNumber === 1, 3_000_000);
  expect(run.status).toBe('completed');

  // The verdict ledger records every judged PR from the backlog.
  const ledger = fs
    .readFileSync(h.wsFile('docs/marketing/proof-moments/judged.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { pr: number; verdict: string });
  expect(ledger.length).toBeGreaterThanOrEqual(5);

  // At least one demoable draft, with the campaign language rules respected.
  const drafts = h.listMd('docs/marketing/proof-moments');
  expect(drafts.length, 'expected at least one demoable PR in the recent backlog').toBeGreaterThan(0);
  for (const file of drafts) {
    const text = fs.readFileSync(h.wsFile(`docs/marketing/proof-moments/${file}`), 'utf8');
    expect(text, `${file} must never use the trapped line`).not.toMatch(/trapped in chat box/i);
    expect(text).toContain('github.com/sero-labs/sero');
  }
  await h.shot('06-proof-moments.png');
  h.commitOutputs('proof-moment-miner backlog outputs');

  const disabled = await h.invoke({ action: 'disable', loopId: id });
  expect(disabled.ok, String(disabled.error ?? '')).not.toBe(false);
});

test('proof-moment-miner: a real main merge fires the event trigger', async () => {
  test.skip(!GH_LIVE, 'set SERO_E2E_GH_LIVE=1 to opt in (merges one docs-only PR into main)');
  test.setTimeout(3_600_000);
  const id = loopIds['proof-moment-miner']!;

  const enabled = await h.invoke({ action: 'enable', loopId: id });
  expect(enabled.ok, String(enabled.error ?? '')).not.toBe(false);

  // The real event: one docs-only PR merged into main. Content is the
  // community-inbox slot file that already exists (identically) on the
  // campaign branch, so the eventual campaign merge stays conflict-free.
  const fireDir = fs.mkdtempSync(path.join(os.tmpdir(), 'miner-fire-'));
  execFileSync('git', ['clone', '-q', '--depth', '1', `https://github.com/${REPO_SLUG}.git`, fireDir]);
  const fireBranch = `docs/community-inbox-slot-${Date.now()}`;
  git(fireDir, ['checkout', '-q', '-b', fireBranch]);
  fs.mkdirSync(path.join(fireDir, 'docs', 'marketing'), { recursive: true });
  fs.copyFileSync(h.wsFile('docs/marketing/community-inbox.md'), path.join(fireDir, 'docs', 'marketing', 'community-inbox.md'));
  git(fireDir, ['add', '--all']);
  git(fireDir, ['commit', '-q', '-m', 'docs(marketing): add community inbox slot for the weekly digest']);
  git(fireDir, ['push', '-q', 'origin', fireBranch]);
  const prUrl = gh(
    [
      'pr', 'create', '-R', REPO_SLUG,
      '--base', 'main', '--head', fireBranch,
      '--title', 'docs(marketing): add community inbox slot',
      '--body', 'Paste-in slot for Discord highlights used by the weekly community digest. Docs-only.',
    ],
    fireDir,
  );
  firePrNumber = prUrl.split('/').pop()!;
  gh(['pr', 'merge', firePrNumber, '-R', REPO_SLUG, '--squash', '--delete-branch'], fireDir);
  fs.rmSync(fireDir, { recursive: true, force: true });

  // Next poll picks the push up (events feed can lag a few minutes).
  const fired = () => h.runsIndex(id)?.runs.find((r) => r.firedBy?.source === 'github:main-updated') ?? null;
  await expect.poll(() => fired()?.id ?? null, { timeout: 900_000, intervals: [10_000] }).not.toBeNull();
  await h.shot('06-miner-fired.png');

  const run = await h.waitRunSettled(id, (r) => r.firedBy?.source === 'github:main-updated', 3_000_000);
  expect(run.status).toBe('completed');

  // The verdict ledger covers the fire PR and the catch-up backlog honestly.
  const ledgerFile = h.wsFile('docs/marketing/proof-moments/judged.jsonl');
  const ledger = fs
    .readFileSync(ledgerFile, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { pr: number; verdict: string });
  expect(ledger.length).toBeGreaterThanOrEqual(5);
  expect(ledger.some((entry) => entry.pr === Number(firePrNumber))).toBe(true);

  // At least one demoable draft, with the campaign language rules respected.
  const drafts = h.listMd('docs/marketing/proof-moments');
  expect(drafts.length, 'expected at least one demoable PR in the recent backlog').toBeGreaterThan(0);
  for (const file of drafts) {
    const text = fs.readFileSync(h.wsFile(`docs/marketing/proof-moments/${file}`), 'utf8');
    expect(text, `${file} must never use the trapped line`).not.toMatch(/trapped in chat box/i);
    expect(text).toContain('github.com/sero-labs/sero');
  }
  await h.shot('07-proof-moments.png');

  const disabled = await h.invoke({ action: 'disable', loopId: id });
  expect(disabled.ok, String(disabled.error ?? '')).not.toBe(false);
  h.commitOutputs('proof-moment-miner outputs');
});

test('wrap-up: every loop is installed, has run, and is left disabled', async () => {
  test.setTimeout(120_000);
  for (const slug of SLUGS) {
    const id = loopIds[slug];
    if (!id) continue;
    const summary = h.orchestratorIndex()?.loops.find((l) => l.id === id);
    expect(summary, `${slug} still installed`).toBeTruthy();
    expect(summary!.status, `${slug} must not stay active after the pass`).not.toBe('active');
  }
  await h.shot('08-wrap-up.png');
});
