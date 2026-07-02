/**
 * Living Loops end-to-end (spec 12): plain-English prompt → event trigger →
 * real event fires the loop → fired-by + source health visible in the UI.
 *
 * Runs the REAL flow — planner and trigger-extractor model calls included —
 * so it is an agent-layer spec:
 *   - default: isolated temp SERO_HOME; needs SERO_E2E_LLM_MODE=cheap + an
 *     API key (e2e/.env.test), like the other *.agent.spec.ts files;
 *   - SERO_E2E_REAL_HOME=1: launches against ~/.sero-ui so the app uses the
 *     developer's existing model login. Creates (and deletes) one loop in a
 *     fresh scratch workspace under ~/.sero-ui/workspaces/.
 *
 * Screenshots land in e2e/screenshots/living-loops/ as review evidence.
 */

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
import { seedWorkflowProfile, waitForShell, createWorkspaceDir } from './helpers/workflow';

const REAL_HOME = process.env.SERO_E2E_REAL_HOME === '1';
const SHOTS = path.resolve(__dirname, 'screenshots', 'living-loops');

const LOOP_PROMPT = [
  'When my deploy service posts to the local webhook named "deploy", append one line to a file',
  'called deploys.log in the workspace root describing the payload (its version field and message',
  'field if present). If a run starts without any webhook payload available, just append a line',
  'saying "no event". Handle exactly one webhook event per run. Do not commit anything; just leave',
  'deploys.log in the working tree. This loop is an ongoing listener with no end state: after',
  'handling each event it must keep waiting for the next one — never treat the overall goal as',
  'finished; it runs until I disable it.',
].join(' ');

const gate = REAL_HOME ? { skip: false as const } : requireLlmReady();

let home: TempSeroHome | undefined;
let app: ElectronApplication;
let page: Page;
let wsDir: string;
let stateDir: string;
let loopId: string;
let hookName: string;
let hookPort: number;

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** The watched orchestrator index (loops live one-per-file next to it). */
interface OrchestratorIndex {
  loops: { id: string; status: string }[];
}

interface LoopFile {
  id: string;
  status: string;
  triggers: { type: string; eventSource?: string; eventCondition?: string; eventFilter?: Record<string, unknown> }[];
}

interface RunsIndex {
  runs: { id: string; runNumber: number; status: string; firedBy?: { source: string; summary: string } }[];
}

/**
 * Real-home reruns reuse the workspace registered by a previous run instead of
 * piling registrations into the developer profile. Registrations live in each
 * profile's agent/workspaces.json ({ workspaces: [{ id, path }] }).
 */
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
      if (entry?.path?.includes('living-loops-e2e') && fs.existsSync(entry.path)) return entry;
    }
  }
  return null;
}

async function shot(name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
}

test.describe.configure({ mode: 'serial' });
test.skip(gate.skip, gate.reason);

test.beforeAll(async () => {
  test.setTimeout(120_000);
  fs.mkdirSync(SHOTS, { recursive: true });

  let seroHome: string;
  if (REAL_HOME) {
    seroHome = path.join(os.homedir(), '.sero-ui');
  } else {
    home = createTempSeroHome();
    seedWorkflowProfile(home);
    seroHome = home.path;
  }

  // A scratch workspace so the loop (and its webhook events) touch nothing
  // real. Real-home reruns reuse the previously registered one — wiped back to
  // a clean slate BEFORE the app launches.
  const existing = REAL_HOME ? findRegisteredWorkspace(seroHome) : null;
  let wsId: string;
  if (existing) {
    wsDir = existing.path;
    wsId = existing.id;
    fs.rmSync(path.join(wsDir, '.sero'), { recursive: true, force: true });
    fs.rmSync(path.join(wsDir, 'deploys.log'), { force: true });
  } else {
    const wsRoot = REAL_HOME ? path.join(seroHome, 'workspaces') : path.join(seroHome, 'e2e-workspaces');
    wsDir = createWorkspaceDir(wsRoot, `living-loops-e2e-${Date.now()}`, {
      'README.md': '# Living Loops e2e scratch workspace\n',
      'notes.txt': 'nothing to see here\n',
    });
    wsId = '';
  }
  stateDir = path.join(wsDir, '.sero', 'apps', 'orchestrator');

  ({ app, page } = await launchSeroApp({
    seroHome,
    runtime: 'host',
    env: REAL_HOME ? {} : getLlmLaunchEnv(),
  }));
  await waitForShell(page);

  if (!wsId) {
    // First run: register through the same IPC the folder picker uses.
    const ws = await page.evaluate(async ({ folderPath, name }) => {
      const created = await window.sero.workspace.addFolder(folderPath, name);
      window.dispatchEvent(new Event('sero:workspace-changed'));
      return created;
    }, { folderPath: wsDir, name: 'Living Loops e2e' });
    wsId = ws.id;
  }
  await page.locator(workspaceSel.nodeById(wsId)).click();
  await expect
    .poll(() => page.evaluate(() => window.sero.layout.load()), { timeout: 10_000 })
    .toMatchObject({ activeWorkspaceId: wsId });
});

test.afterAll(async () => {
  try {
    await closeSeroApp(app);
  } finally {
    home?.cleanup();
  }
});

test('a plain-English prompt produces an event-triggered loop', async () => {
  test.setTimeout(360_000);

  const opened = await page.evaluate(() => Boolean(window.__appControl?.openApp('orchestrator')));
  expect(opened).toBe(true);
  const panel = page.locator('[data-app="orchestrator"]').first();
  await expect(panel).toBeVisible({ timeout: 20_000 });

  await panel.getByRole('button', { name: 'New loop' }).click();
  await panel.getByPlaceholder(/Every 10 minutes/).fill(LOOP_PROMPT);
  // Workspace-root mode: the scratch workspace is not a git repo, and the loop
  // only appends a log line — no branch machinery needed.
  await panel.locator('#loop-worktree').click();
  await panel.locator('#loop-allow-dirty').click();
  await shot('01-describe.png');
  await panel.getByRole('button', { name: 'Generate plan' }).click();

  // Real planner + trigger-extractor calls run here.
  await expect(panel.getByText("Here's the plan the AI wrote")).toBeVisible({ timeout: 300_000 });

  // The trigger extractor must have authored a webhook event trigger, shown
  // as a chip in the review's meta strip (Phase 5 UI).
  await expect(panel.getByText(/webhook:[a-z][a-z0-9-]*/).first()).toBeVisible({ timeout: 10_000 });
  await shot('02-create-review-with-event-trigger.png');

  await panel.getByRole('button', { name: 'Activate loop' }).click();
  await expect(panel.getByText('Attempt history')).toBeVisible({ timeout: 20_000 });

  // Cross-check the persisted state: an event trigger with a webhook source.
  await expect
    .poll(() => {
      const index = readJson<OrchestratorIndex>(path.join(stateDir, 'index.json'));
      const summary = index?.loops.at(-1);
      if (!summary) return null;
      const loop = readJson<LoopFile>(path.join(stateDir, 'loops', summary.id, 'loop.json'));
      const trigger = loop?.triggers.find((t) => t.eventSource?.startsWith('webhook:'));
      if (loop && trigger) {
        loopId = loop.id;
        hookName = trigger.eventSource!.slice('webhook:'.length);
        return { status: summary.status, source: trigger.eventSource };
      }
      return null;
    }, { timeout: 20_000 })
    .toMatchObject({ status: 'active' });

  await shot('03-loop-detail-active.png');
});

test('activation starts the webhook listener on demand', async () => {
  // Demand-driven: the loopback listener exists only because an active loop
  // subscribes. Its port persists in the adapter state file.
  await expect
    .poll(() => {
      const state = readJson<{ port?: number }>(path.join(stateDir, 'events', 'webhook.json'));
      if (state?.port) hookPort = state.port;
      return state?.port ?? null;
    }, { timeout: 30_000 })
    .toBeGreaterThan(0);

  // A POST to an unused hook name proves the listener answers without firing
  // the loop (202 = accepted, broadcast matches no trigger).
  const probe = await fetch(`http://127.0.0.1:${hookPort}/hooks/ping`, { method: 'POST', body: '{}' });
  expect(probe.status).toBe(202);

  // The loop's meta strip shows the hook address (source-health chip).
  const panel = page.locator('[data-app="orchestrator"]').first();
  await expect(panel.getByText(`Hooks · 127.0.0.1:${hookPort}`)).toBeVisible({ timeout: 15_000 });
});

test('a webhook POST fires the loop and the run records what fired it', async () => {
  test.setTimeout(600_000);

  // Let the activation pass finish and the loop settle back to active-idle
  // first, so this covers the clean fire path (event on an idle loop ⇒ fresh
  // pass). The mid-run stash path is exercised by unit tests.
  const runsFile = path.join(stateDir, 'loops', loopId, 'runs', 'index.json');
  await expect
    .poll(() => readJson<RunsIndex>(runsFile)?.runs.at(-1)?.status ?? 'pending', { timeout: 240_000, intervals: [3_000] })
    .toMatch(/completed|blocked|failed/);
  await expect
    .poll(() => readJson<OrchestratorIndex>(path.join(stateDir, 'index.json'))?.loops.at(-1)?.status, { timeout: 60_000 })
    .toBe('active');

  const response = await fetch(`http://127.0.0.1:${hookPort}/hooks/${hookName}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: '1.2.3', message: 'living loops e2e' }),
  });
  expect(response.status).toBe(202);

  // A run fired by the event must appear, carrying firedBy (webhook:<name>).
  const firedRun = () =>
    readJson<RunsIndex>(runsFile)?.runs.find((r) => r.firedBy?.source === `webhook:${hookName}`) ?? null;
  await expect
    .poll(() => firedRun()?.runNumber ?? null, { timeout: 120_000, intervals: [2_000] })
    .toBeGreaterThan(0);

  // UI: expand the run history and check the fired-by chip.
  const panel = page.locator('[data-app="orchestrator"]').first();
  await panel.getByText('Attempt history').click();
  await expect(panel.getByText(`webhook:${hookName}`).first()).toBeVisible({ timeout: 15_000 });
  await shot('04-run-fired-by-webhook.png');

  // Let the fired run finish (a real background agent appends the log line).
  await expect
    .poll(() => firedRun()?.status ?? 'running', { timeout: 360_000, intervals: [5_000] })
    .toMatch(/completed|blocked|failed/);
  await shot('05-run-finished.png');

  expect(firedRun()!.status).toBe('completed');
  // The payload genuinely reached the work: the agent wrote the log line.
  const log = fs.readFileSync(path.join(wsDir, 'deploys.log'), 'utf8');
  expect(log).toContain('1.2.3');
});

test('the listener stops when the loop is disabled and returns when enabled', async () => {
  const panel = page.locator('[data-app="orchestrator"]').first();

  await panel.getByRole('button', { name: 'Disable' }).click();
  // Last subscriber gone ⇒ the port must stop answering entirely.
  await expect
    .poll(async () => {
      try {
        await fetch(`http://127.0.0.1:${hookPort}/hooks/ping`, { method: 'POST', body: '{}' });
        return 'listening';
      } catch {
        return 'stopped';
      }
    }, { timeout: 20_000 })
    .toBe('stopped');
  await shot('06-disabled-listener-stopped.png');

  await panel.getByRole('button', { name: 'Enable' }).click();
  // Demand returns ⇒ same persisted port comes back.
  await expect
    .poll(async () => {
      try {
        const probe = await fetch(`http://127.0.0.1:${hookPort}/hooks/ping`, { method: 'POST', body: '{}' });
        return probe.status;
      } catch {
        return 0;
      }
    }, { timeout: 30_000 })
    .toBe(202);
});

test('cleanup: delete the test loop', async () => {
  const panel = page.locator('[data-app="orchestrator"]').first();
  await panel.getByRole('button', { name: 'Disable' }).click({ timeout: 5_000 }).catch(() => {});
  await panel.getByRole('button', { name: 'Delete', exact: false }).first().click();
  await panel.getByRole('button', { name: 'Confirm delete' }).click();
  await expect
    .poll(() => readJson<OrchestratorIndex>(path.join(stateDir, 'index.json'))?.loops.length ?? -1, { timeout: 15_000 })
    .toBe(0);
});
