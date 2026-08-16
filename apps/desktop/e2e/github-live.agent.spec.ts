/**
 * Live GitHub adapter end-to-end (Living Loops loose end, folded into the
 * spec-13 verification phase): the github event source has only ever been
 * tested against fakes — this proves it against the REAL `gh` CLI and a real
 * repository event (a label added to a scratch issue fires the loop).
 *
 * Deliberately double-gated — it creates real activity on your GitHub account:
 *   - SERO_E2E_GH_LIVE=1 must be set (explicit opt-in), and
 *   - `gh auth status` must succeed.
 * Plus the usual agent-spec gate (SERO_E2E_REAL_HOME=1 or LLM env).
 *
 * It uses a private scratch repo `sero-e2e-github-live` on the authenticated
 * account — created on first run and REUSED forever after (deleting repos
 * needs the delete_repo scope most logins lack, so cleanup closes the issue
 * and deletes the loop, never the repo).
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeSeroApp,
  createTempSeroHome,
  launchSeroApp,
  requireLlmReady,
  getLlmLaunchEnv,
  workspace as workspaceSel,
  type TempSeroHome,
} from './helpers';
import { seedWorkflowProfile, waitForShell } from './helpers/workflow';

const REAL_HOME = process.env.SERO_E2E_REAL_HOME === '1';
const OPTED_IN = process.env.SERO_E2E_GH_LIVE === '1';
const REPO_NAME = 'sero-e2e-github-live';
const LABEL = 'e2e-fire';
const SHOTS = path.resolve(__dirname, 'screenshots', 'delivery');

function gh(args: string[], cwd?: string): string {
  return execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function ghReady(): boolean {
  try {
    gh(['auth', 'status']);
    return true;
  } catch {
    return false;
  }
}

const llmGate = REAL_HOME ? { skip: false as const, reason: '' } : { ...requireLlmReady(), reason: requireLlmReady().reason ?? '' };
const skip = !OPTED_IN || !ghReady() || llmGate.skip;
const skipReason = !OPTED_IN
  ? 'set SERO_E2E_GH_LIVE=1 to opt in (creates real GitHub activity)'
  : !ghReady()
    ? 'gh auth status failed — log in with `gh auth login`'
    : llmGate.reason;

let home: TempSeroHome | undefined;
let app: ElectronApplication;
let page: Page;
let wsDir: string;
let wsId: string;
let stateDir: string;
let repoSlug: string;
let issueNumber: string;
let loopId: string;

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

interface OrchestratorIndex {
  loops: { id: string; status: string }[];
}
interface LoopFile {
  id: string;
  triggers: { type: string; eventSource?: string }[];
}
interface RunsIndex {
  runs: { id: string; status: string; firedBy?: { source: string; summary: string } }[];
}

test.describe.configure({ mode: 'serial' });
test.skip(skip, skipReason);

test.beforeAll(async () => {
  test.setTimeout(180_000);
  fs.mkdirSync(SHOTS, { recursive: true });

  // Scratch repo: reuse if it exists, create once if not.
  const login = gh(['api', 'user', '--jq', '.login']);
  repoSlug = `${login}/${REPO_NAME}`;
  try {
    gh(['repo', 'view', repoSlug, '--json', 'name']);
  } catch {
    gh(['repo', 'create', repoSlug, '--private', '--add-readme']);
  }
  gh(['label', 'create', LABEL, '-R', repoSlug, '--force']);

  let seroHome: string;
  if (REAL_HOME) {
    seroHome = path.join(os.homedir(), '.sero-ui');
  } else {
    home = createTempSeroHome();
    seedWorkflowProfile(home);
    seroHome = home.path;
  }

  // Fresh clone each run — the workspace registration is new each time in
  // temp-home mode; in real-home mode the previous registration is reused.
  const wsRoot = REAL_HOME ? path.join(seroHome, 'workspaces') : path.join(seroHome, 'e2e-workspaces');
  wsDir = path.join(wsRoot, 'github-live-e2e');
  fs.rmSync(wsDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(wsDir), { recursive: true });
  gh(['repo', 'clone', repoSlug, wsDir]);
  stateDir = path.join(wsDir, '.sero', 'apps', 'orchestrator');

  // Poll at the 60s floor instead of the 2-minute default so the fire arrives
  // inside the test budget (intervalMs is honored via the adapter state file).
  fs.mkdirSync(path.join(stateDir, 'events'), { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'events', 'github.json'), JSON.stringify({ intervalMs: 60_000 }));

  ({ app, page } = await launchSeroApp({
    seroHome,
    runtime: 'host',
    env: REAL_HOME ? {} : getLlmLaunchEnv(),
  }));
  await waitForShell(page);

  const existingId = await page.evaluate(async (folder) => {
    const list = await window.sero.workspace.list();
    return list.find((w: { path: string }) => w.path === folder)?.id ?? null;
  }, wsDir).catch(() => null);
  if (existingId) {
    wsId = existingId;
  } else {
    const ws = await page.evaluate(async ({ folderPath, name }) => {
      const created = await window.sero.workspace.addFolder(folderPath, name);
      window.dispatchEvent(new Event('sero:workspace-changed'));
      return created;
    }, { folderPath: wsDir, name: 'GitHub live e2e' });
    wsId = ws.id;
  }
  await page.locator(workspaceSel.nodeById(wsId)).click();
  await expect
    .poll(() => page.evaluate(() => window.sero.layout.load()), { timeout: 10_000 })
    .toMatchObject({ activeWorkspaceId: wsId });
});

test.afterAll(async () => {
  try {
    if (issueNumber) gh(['issue', 'close', issueNumber, '-R', repoSlug]).trim();
  } catch { /* best-effort */ }
  try {
    await closeSeroApp(app);
  } finally {
    home?.cleanup();
  }
});

test('a plain-English prompt produces a github issue-labelled trigger', async () => {
  test.setTimeout(420_000);

  const opened = await page.evaluate(() => Boolean(window.__appControl?.openApp('orchestrator')));
  expect(opened).toBe(true);
  const panel = page.locator('[data-app="orchestrator"]').first();
  await expect(panel).toBeVisible({ timeout: 20_000 });

  await panel.getByRole('button', { name: 'New loop' }).first().click();
  await panel.getByPlaceholder(/Every 10 minutes/).fill(
    `Whenever an issue in this repo gets the label "${LABEL}", append one line with the issue number and title to triage.log in the workspace root. Handle exactly one issue per run. Do not commit anything. This loop is an ongoing listener with no end state — it runs until I disable it.`,
  );
  await panel.locator('#loop-worktree').click();
  await panel.locator('#loop-allow-dirty').click();
  await panel.getByRole('button', { name: 'Generate plan' }).click();
  await expect(panel.getByText("Here's the plan the AI wrote")).toBeVisible({ timeout: 300_000 });
  await panel.getByRole('button', { name: 'Activate workflow' }).click();
  await expect(panel.getByText('Attempt history')).toBeVisible({ timeout: 20_000 });

  await expect
    .poll(() => {
      const index = readJson<OrchestratorIndex>(path.join(stateDir, 'index.json'));
      const summary = index?.loops.at(-1);
      if (!summary) return null;
      const loop = readJson<LoopFile>(path.join(stateDir, 'loops', summary.id, 'loop.json'));
      const trigger = loop?.triggers.find((t) => t.eventSource === 'github:issue-labelled');
      if (loop && trigger) {
        loopId = loop.id;
        return summary.status;
      }
      return null;
    }, { timeout: 20_000 })
    .toBe('active');
});

test('the poller runs against the real gh login', async () => {
  test.setTimeout(180_000);
  // lastPolledAt proves a real `gh api` poll cycle succeeded (not a fake).
  await expect
    .poll(() => readJson<{ lastPolledAt?: string }>(path.join(stateDir, 'events', 'github.json'))?.lastPolledAt ?? null,
      { timeout: 120_000, intervals: [5_000] })
    .not.toBeNull();
});

test('labelling a real issue fires the loop and the work lands', async () => {
  test.setTimeout(900_000);

  const issueUrl = gh(['issue', 'create', '-R', repoSlug, '--title', `E2E fire ${Date.now()}`, '--body', 'Scratch issue for the live adapter pass.']);
  issueNumber = issueUrl.split('/').pop()!;
  gh(['issue', 'edit', issueNumber, '-R', repoSlug, '--add-label', LABEL]);

  const runsFile = path.join(stateDir, 'loops', loopId, 'runs', 'index.json');
  const firedRun = () =>
    readJson<RunsIndex>(runsFile)?.runs.find((r) => r.firedBy?.source === 'github:issue-labelled') ?? null;

  // Next poll (≤ ~70s) must pick the label event up and fire the loop.
  await expect
    .poll(() => firedRun()?.id ?? null, { timeout: 360_000, intervals: [5_000] })
    .not.toBeNull();

  const panel = page.locator('[data-app="orchestrator"]').first();
  await panel.getByText('Attempt history').click();
  await expect(panel.getByText('github:issue-labelled').first()).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: path.join(SHOTS, 'github-live-fired.png'), fullPage: false });

  await expect
    .poll(() => firedRun()?.status ?? 'running', { timeout: 360_000, intervals: [5_000] })
    .toMatch(/completed|blocked|failed/);
  expect(firedRun()!.status).toBe('completed');
  const log = fs.readFileSync(path.join(wsDir, 'triage.log'), 'utf8');
  expect(log).toContain(issueNumber);
});

test('cleanup: delete the loop (the scratch repo stays for reuse)', async () => {
  await page.evaluate(
    ({ workspaceId, id }) =>
      window.sero.appAgent.invokeTool('orchestrator', workspaceId, 'orchestrator', { action: 'delete', loopId: id }),
    { workspaceId: wsId, id: loopId },
  );
  await expect
    .poll(() => readJson<OrchestratorIndex>(path.join(stateDir, 'index.json'))?.loops.length ?? -1, { timeout: 15_000 })
    .toBe(0);
});
