/**
 * Focused live-fire for the proof-moment-miner (growth plan 2.6 acceptance:
 * "each loop runs end-to-end from its trigger"). Reuses the miner loop already
 * installed + active in the marketing-loops-e2e workspace — no catalog re-run.
 *
 * Flow: launch Sero → the active miner's GitHub poller baselines → this spec
 * opens ONE tiny docs-only PR and PAUSES, printing the PR number. A human
 * merges it (Dan, through GitHub's own UI — that is the approval). The push to
 * main fires github:main-updated; the spec verifies the loop ran end-to-end.
 *
 * Real-home only, opt-in (it creates a real PR):
 *   SERO_E2E_REAL_HOME=1 SERO_E2E_GH_LIVE=1 \
 *     npx playwright test e2e/miner-live-fire.agent.spec.ts --project=agent
 *
 * The spec never merges. If no one merges within the window it fails cleanly
 * and closes the PR it opened.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, launchSeroApp, workspace as workspaceSel, layout as layoutSel } from './helpers';
import { waitForShell } from './helpers/workflow';

const REAL_HOME = process.env.SERO_E2E_REAL_HOME === '1';
const GH_LIVE = process.env.SERO_E2E_GH_LIVE === '1';
const REPO_SLUG = 'sero-labs/sero';
const WS_MARKER = 'marketing-loops-e2e';
const SHOTS = path.resolve(__dirname, 'screenshots', 'marketing-loops');

let app: ElectronApplication;
let page: Page;
let wsDir: string;
let wsId: string;
let stateDir: string;
let minerId: string;
let firePrNumber = '';

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

interface OrchestratorIndex {
  loops: { id: string; status: string; title?: string }[];
}
interface RunsIndex {
  runs: { id: string; status: string; firedBy?: { source: string; summary: string } }[];
}

const runsIndex = (id: string) => readJson<RunsIndex>(path.join(stateDir, 'loops', id, 'runs', 'index.json'));

function gh(args: string[], cwd?: string): string {
  return execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function git(repoDir: string, args: string[]): string {
  return execFileSync('git', ['-C', repoDir, '-c', 'user.email=e2e@sero.test', '-c', 'user.name=sero-e2e', ...args], {
    encoding: 'utf8',
  }).trim();
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
      if (entry?.path?.includes(WS_MARKER) && fs.existsSync(entry.path)) return entry;
    }
  }
  return null;
}

async function invoke(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await page.evaluate(
    ({ workspaceId, toolParams }) =>
      window.sero.appAgent.invokeTool('orchestrator', workspaceId, 'orchestrator', toolParams),
    { workspaceId: wsId, toolParams: params },
  );
  return ((result as { details?: Record<string, unknown> })?.details ?? {}) as Record<string, unknown>;
}

test.describe.configure({ mode: 'serial' });
test.skip(!REAL_HOME || !GH_LIVE, 'needs SERO_E2E_REAL_HOME=1 and SERO_E2E_GH_LIVE=1 (opens a real PR)');

test.beforeAll(async () => {
  test.setTimeout(180_000);
  fs.mkdirSync(SHOTS, { recursive: true });
  const seroHome = path.join(os.homedir(), '.sero-ui');

  const existing = findRegisteredWorkspace(seroHome);
  expect(existing, `no ${WS_MARKER} workspace registered — run the full marketing-loops suite first`).toBeTruthy();
  wsDir = existing!.path;
  wsId = existing!.id;
  stateDir = path.join(wsDir, '.sero', 'apps', 'orchestrator');

  // Keep the orchestrator's own state out of the miner's git-status audit, and
  // poll GitHub at the 60s floor so the fire lands promptly.
  fs.mkdirSync(path.join(wsDir, '.git', 'info'), { recursive: true });
  fs.writeFileSync(path.join(wsDir, '.git', 'info', 'exclude'), '.sero/\n');
  fs.mkdirSync(path.join(stateDir, 'events'), { recursive: true });
  const ghState = readJson<Record<string, unknown>>(path.join(stateDir, 'events', 'github.json')) ?? {};
  fs.writeFileSync(path.join(stateDir, 'events', 'github.json'), JSON.stringify({ ...ghState, intervalMs: 60_000 }));

  ({ app, page } = await launchSeroApp({ seroHome, runtime: 'host', env: {} }));
  await waitForShell(page);
  if (!(await page.locator(layoutSel.sidebarPanel).isVisible().catch(() => false))) {
    await page.locator(layoutSel.sidebarToggle).click();
  }
  await page.locator(workspaceSel.nodeById(wsId)).click();
  await expect
    .poll(() => page.evaluate(() => window.sero.layout.load()), { timeout: 10_000 })
    .toMatchObject({ activeWorkspaceId: wsId });
  const opened = await page.evaluate(() => Boolean(window.__appControl?.openApp('orchestrator')));
  expect(opened).toBe(true);
  await expect(page.locator('[data-app="orchestrator"]').first()).toBeVisible({ timeout: 20_000 });

  const miner = readJson<OrchestratorIndex>(path.join(stateDir, 'index.json'))?.loops.find((l) =>
    /proof moment miner/i.test(l.title ?? ''),
  );
  expect(miner, 'proof-moment-miner loop must already be installed in the workspace').toBeTruthy();
  minerId = miner!.id;
});

test.afterAll(async () => {
  // Never leave a dangling PR: if it was opened but not merged, close it.
  if (firePrNumber) {
    try {
      const state = gh(['pr', 'view', firePrNumber, '-R', REPO_SLUG, '--json', 'state', '--jq', '.state']);
      if (state === 'OPEN') gh(['pr', 'close', firePrNumber, '-R', REPO_SLUG, '--delete-branch']);
    } catch {
      /* best effort */
    }
  }
  try {
    await closeSeroApp(app);
  } catch {
    /* already closed */
  }
});

test('the active miner is armed and its GitHub poller is live', async () => {
  test.setTimeout(240_000);
  if (readJson<OrchestratorIndex>(path.join(stateDir, 'index.json'))?.loops.find((l) => l.id === minerId)?.status !== 'active') {
    const enabled = await invoke({ action: 'enable', loopId: minerId });
    expect(enabled.ok, String(enabled.error ?? '')).not.toBe(false);
  }
  // A fresh poll cycle proves the github adapter is running (baseline set).
  await expect
    .poll(() => readJson<{ lastPolledAt?: string }>(path.join(stateDir, 'events', 'github.json'))?.lastPolledAt ?? null, {
      timeout: 180_000,
      intervals: [5_000],
    })
    .not.toBeNull();
});

test('open the PR, wait for a human to merge, and verify the loop fires', async () => {
  test.setTimeout(1_800_000);

  // Open ONE docs-only PR (identical to the file already on the campaign
  // branch, so the eventual campaign merge stays conflict-free). We never
  // merge it — a human does.
  const fireDir = fs.mkdtempSync(path.join(os.tmpdir(), 'miner-fire-'));
  execFileSync('git', ['clone', '-q', '--depth', '1', `https://github.com/${REPO_SLUG}.git`, fireDir]);
  const fireBranch = `docs/community-inbox-slot-${Date.now()}`;
  git(fireDir, ['checkout', '-q', '-b', fireBranch]);
  fs.mkdirSync(path.join(fireDir, 'docs', 'marketing'), { recursive: true });
  fs.copyFileSync(
    path.join(wsDir, 'docs', 'marketing', 'community-inbox.md'),
    path.join(fireDir, 'docs', 'marketing', 'community-inbox.md'),
  );
  git(fireDir, ['add', '--all']);
  git(fireDir, ['commit', '-q', '-m', 'docs(marketing): add community inbox slot for the weekly digest']);
  git(fireDir, ['push', '-q', 'origin', fireBranch]);
  const prUrl = gh(
    [
      'pr', 'create', '-R', REPO_SLUG,
      '--base', 'main', '--head', fireBranch,
      '--title', 'docs(marketing): add community inbox slot',
      '--body', 'Docs-only. Paste-in slot for the weekly community digest. Merge to fire the proof-moment-miner loop.',
    ],
    fireDir,
  );
  firePrNumber = prUrl.split('/').pop()!;
  fs.rmSync(fireDir, { recursive: true, force: true });

  const runsFile = path.join(stateDir, 'loops', minerId, 'runs', 'index.json');
  const baseline = runsIndex(minerId)?.runs.length ?? 0;

  // eslint-disable-next-line no-console
  console.log(`\n\n========================================\n  MERGE NOW → ${prUrl}\n  (PR #${firePrNumber}, docs-only). The loop fires once main updates.\n========================================\n`);
  fs.writeFileSync(path.join(SHOTS, 'merge-me.txt'), `${prUrl}\nPR #${firePrNumber}\n`);

  // Wait for the merge (up to ~20 min) — main updates, the poller sees it.
  await expect
    .poll(() => gh(['pr', 'view', firePrNumber, '-R', REPO_SLUG, '--json', 'state', '--jq', '.state']), {
      timeout: 1_200_000,
      intervals: [10_000],
    })
    .toBe('MERGED');

  // The poller (≤60s) picks up github:main-updated and fires a run.
  const fired = () => runsIndex(minerId)?.runs.find((r) => r.firedBy?.source === 'github:main-updated') ?? null;
  await expect
    .poll(() => fired()?.id ?? null, { timeout: 600_000, intervals: [10_000] })
    .not.toBeNull();
  await page.screenshot({ path: path.join(SHOTS, 'live-fire-fired.png'), fullPage: false }).catch(() => {});

  // Let the fired run settle.
  await expect
    .poll(() => fired()?.status ?? 'running', { timeout: 1_200_000, intervals: [10_000] })
    .toMatch(/completed|blocked|failed/);
  expect(fired()!.status, 'the event-fired miner run must complete cleanly').toBe('completed');
  expect(runsIndex(minerId)!.runs.length).toBeGreaterThan(baseline);

  // The fire PR is judged in the ledger (docs-only → not demoable is correct).
  const ledger = fs
    .readFileSync(path.join(wsDir, 'docs', 'marketing', 'proof-moments', 'judged.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { pr: number });
  expect(ledger.some((e) => e.pr === Number(firePrNumber))).toBe(true);
});
