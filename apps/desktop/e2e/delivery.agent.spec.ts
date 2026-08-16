/**
 * Pluggable delivery end-to-end (spec 13): destination picked in the create
 * form → planner authors the delivery steps → the receipt contract and the
 * external approval gate hold in the REAL app.
 *
 * Three journeys, all against a scratch workspace and a loopback HTTP
 * listener this spec owns (no external services):
 *   1. saved-artifact — delivers a report file, receipt verified back against
 *      the real file, receipt badge in run history;
 *   2. webhook-post approved — the loop parks with the draft on the input
 *      card, approval releases exactly ONE POST, the receipt records it;
 *   3. webhook-post rejected — nothing ever arrives at the listener and the
 *      loop never completes with a receipt.
 *
 * Same launch modes as living-loops.agent.spec.ts: temp SERO_HOME with
 * SERO_E2E_LLM_MODE=cheap, or SERO_E2E_REAL_HOME=1 against ~/.sero-ui.
 * Screenshots land in e2e/screenshots/delivery/.
 */

import fs from 'node:fs';
import http from 'node:http';
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
const SHOTS = path.resolve(__dirname, 'screenshots', 'delivery');

const gate = REAL_HOME ? { skip: false as const } : requireLlmReady();

let home: TempSeroHome | undefined;
let app: ElectronApplication;
let page: Page;
let wsDir: string;
let wsId: string;
let stateDir: string;

// Loopback listener owned by the spec: records every request so "nothing
// arrived" is provable, not assumed.
let listener: http.Server;
let listenerPort: number;
const received: { path: string; body: string }[] = [];

let approveLoopId: string;
let rejectLoopId: string;

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
  status: string;
  delivery?: { destination: string; params?: Record<string, unknown> };
  plan: { steps: { id: string; gate?: string }[] };
  answeredInputs?: { consumedAt?: string; questions: { kind?: string }[] }[];
  runtime: {
    deliveries?: { destination: string; ref: string }[];
    pendingInput?: { questions: { kind?: string; attachment?: string; choices?: { id: string; label: string }[] }[] };
  };
}

interface RunsIndex {
  runs: { id: string; status: string; delivery?: { destination: string; ref: string } }[];
}

const loopFile = (id: string) => readJson<LoopFile>(path.join(stateDir, 'loops', id, 'loop.json'));
const runsIndex = (id: string) => readJson<RunsIndex>(path.join(stateDir, 'loops', id, 'runs', 'index.json'));
const lastLoopId = () => readJson<OrchestratorIndex>(path.join(stateDir, 'index.json'))?.loops.at(-1)?.id ?? null;

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
      if (entry?.path?.includes('delivery-e2e') && fs.existsSync(entry.path)) return entry;
    }
  }
  return null;
}

async function shot(name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
}

const panel = () => page.locator('[data-app="orchestrator"]').first();

/** Fills the create form (workspace-root placement) with a destination and params. */
async function createLoop(prompt: string, destination: string, params: Record<string, string>): Promise<string> {
  await panel().getByRole('button', { name: 'New loop' }).first().click();
  await panel().getByPlaceholder(/Every 10 minutes/).fill(prompt);
  await panel().locator('#loop-worktree').click(); // workspace root — scratch dir, no git
  await panel().locator('#loop-allow-dirty').click();
  await panel().locator('#loop-delivery').selectOption(destination);
  for (const [placeholder, value] of Object.entries(params)) {
    await panel().getByPlaceholder(placeholder).fill(value);
  }
  const before = readJson<OrchestratorIndex>(path.join(stateDir, 'index.json'))?.loops.length ?? 0;
  await panel().getByRole('button', { name: 'Generate plan' }).click();
  await expect(panel().getByText("Here's the plan the AI wrote")).toBeVisible({ timeout: 300_000 });

  let id: string | null = null;
  await expect
    .poll(() => {
      const index = readJson<OrchestratorIndex>(path.join(stateDir, 'index.json'));
      if ((index?.loops.length ?? 0) > before) id = lastLoopId();
      return id;
    }, { timeout: 20_000 })
    .not.toBeNull();
  return id!;
}

/** Answers the pending approval on the CURRENTLY OPEN loop detail by choice id. */
async function answerApproval(loopId: string, choiceId: 'approve' | 'reject'): Promise<void> {
  // The labels are model-authored (parse guarantees the ids) — read the label
  // for the wanted id from state and click that exact button.
  const question = loopFile(loopId)!.runtime.pendingInput!.questions[0];
  const label = question.choices!.find((c) => c.id === choiceId)!.label;
  await panel().getByRole('button', { name: label, exact: true }).click();
  await panel().getByRole('button', { name: 'Send answer & continue' }).click();
}

test.describe.configure({ mode: 'serial' });
test.skip(gate.skip, gate.reason);

test.beforeAll(async () => {
  test.setTimeout(120_000);
  fs.mkdirSync(SHOTS, { recursive: true });

  listener = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      received.push({ path: req.url ?? '', body });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  listenerPort = (listener.address() as { port: number }).port;

  let seroHome: string;
  if (REAL_HOME) {
    seroHome = path.join(os.homedir(), '.sero-ui');
  } else {
    home = createTempSeroHome();
    seedWorkflowProfile(home);
    seroHome = home.path;
  }

  const existing = REAL_HOME ? findRegisteredWorkspace(seroHome) : null;
  if (existing) {
    wsDir = existing.path;
    wsId = existing.id;
    fs.rmSync(path.join(wsDir, '.sero'), { recursive: true, force: true });
    for (const stale of fs.readdirSync(wsDir)) {
      if (stale.endsWith('.md') && stale !== 'README.md') fs.rmSync(path.join(wsDir, stale), { force: true });
    }
  } else {
    const wsRoot = REAL_HOME ? path.join(seroHome, 'workspaces') : path.join(seroHome, 'e2e-workspaces');
    wsDir = createWorkspaceDir(wsRoot, `delivery-e2e-${Date.now()}`, {
      'README.md': [
        '# Delivery e2e scratch project',
        '',
        'A tiny pretend project. It has a parser, a formatter, and a CLI.',
        'Recent work: fixed the date parser, added CSV export, sped up startup.',
      ].join('\n'),
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
    const ws = await page.evaluate(async ({ folderPath, name }) => {
      const created = await window.sero.workspace.addFolder(folderPath, name);
      window.dispatchEvent(new Event('sero:workspace-changed'));
      return created;
    }, { folderPath: wsDir, name: 'Delivery e2e' });
    wsId = ws.id;
  }
  await page.locator(workspaceSel.nodeById(wsId)).click();
  await expect
    .poll(() => page.evaluate(() => window.sero.layout.load()), { timeout: 10_000 })
    .toMatchObject({ activeWorkspaceId: wsId });

  const opened = await page.evaluate(() => Boolean(window.__appControl?.openApp('orchestrator')));
  expect(opened).toBe(true);
  await expect(panel()).toBeVisible({ timeout: 20_000 });
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  try {
    await closeSeroApp(app);
  } finally {
    home?.cleanup();
  }
});

test('a saved-artifact loop delivers a report with a receipt verified against the real file', async () => {
  test.setTimeout(900_000);

  const loopId = await createLoop(
    'Read README.md and write a short project digest as a saved report. One pass, then complete.',
    'saved-artifact',
    { 'Report name': 'digest' },
  );

  // The chosen destination is on the loop and visible on the review meta strip.
  expect(loopFile(loopId)?.delivery).toMatchObject({ destination: 'saved-artifact' });
  await expect(panel().getByText('Saved report').first()).toBeVisible();
  await shot('01-review-saved-artifact.png');

  await panel().getByRole('button', { name: 'Activate workflow' }).click();
  await expect(panel().getByText('Attempt history')).toBeVisible({ timeout: 20_000 });

  // The loop may only complete WITH a receipt (contract enforced end-to-end).
  await expect
    .poll(() => readJson<OrchestratorIndex>(path.join(stateDir, 'index.json'))?.loops.find((l) => l.id === loopId)?.status,
      { timeout: 600_000, intervals: [5_000] })
    .toBe('complete');

  const run = runsIndex(loopId)!.runs.find((r) => r.delivery);
  expect(run?.delivery?.destination).toBe('saved-artifact');
  // Verify-back held: the receipt's file genuinely exists in the workspace.
  const ref = run!.delivery!.ref;
  const filePath = ref.startsWith('/') ? ref : path.join(wsDir, ref);
  expect(fs.existsSync(filePath)).toBe(true);
  expect(loopFile(loopId)?.runtime.deliveries).toHaveLength(1);

  // Receipt badge in run history (non-URL ref renders as text).
  await panel().getByText('Attempt history').click();
  await expect(panel().getByText('Saved report').first()).toBeVisible({ timeout: 15_000 });
  await shot('02-saved-artifact-receipt.png');
});

test('an external webhook loop parks for approval with the draft attached', async () => {
  test.setTimeout(900_000);

  approveLoopId = await createLoop(
    'Compose a two-sentence release announcement from README.md and deliver it. One pass, then complete.',
    'webhook-post',
    { 'https://…': `http://127.0.0.1:${listenerPort}/approve-hook` },
  );

  // FR-D4 plan shape: the plan carries an approval gate step.
  expect(loopFile(approveLoopId)?.plan.steps.some((s) => s.gate === 'approval')).toBe(true);

  await panel().getByRole('button', { name: 'Activate workflow' }).click();
  await expect(panel().getByText('Attempt history')).toBeVisible({ timeout: 20_000 });

  // The loop must park on an approval question — with the draft attached.
  await expect
    .poll(() => loopFile(approveLoopId)?.runtime.pendingInput?.questions[0]?.kind ?? null,
      { timeout: 600_000, intervals: [5_000] })
    .toBe('approval');
  const question = loopFile(approveLoopId)!.runtime.pendingInput!.questions[0];
  expect(question.attachment?.trim()).toBeTruthy();

  // The draft is visible on the input card; nothing has hit the listener.
  await expect(panel().getByText('Needs your input')).toBeVisible({ timeout: 15_000 });
  await expect(panel().locator('pre').first()).toBeVisible();
  expect(received.filter((r) => r.path === '/approve-hook')).toHaveLength(0);
  await shot('03-approval-card-with-draft.png');
});

test('approving releases exactly one POST and records the receipt', async () => {
  test.setTimeout(900_000);

  await answerApproval(approveLoopId, 'approve');

  // The POST arrives at the spec's listener…
  await expect
    .poll(() => received.filter((r) => r.path === '/approve-hook').length, { timeout: 600_000, intervals: [3_000] })
    .toBe(1);

  // …and the loop completes with a webhook receipt; the approval is consumed.
  await expect
    .poll(() => readJson<OrchestratorIndex>(path.join(stateDir, 'index.json'))?.loops.find((l) => l.id === approveLoopId)?.status,
      { timeout: 600_000, intervals: [5_000] })
    .toBe('complete');
  const loop = loopFile(approveLoopId)!;
  expect(loop.runtime.deliveries).toHaveLength(1);
  expect(loop.runtime.deliveries![0].destination).toBe('webhook-post');
  const approval = loop.answeredInputs!.find((a) => a.questions.some((q) => q.kind === 'approval'));
  expect(approval?.consumedAt).toBeTruthy();

  await panel().getByText('Attempt history').click();
  await expect(panel().getByText('Webhook POST').first()).toBeVisible({ timeout: 15_000 });
  await shot('04-webhook-receipt-in-history.png');
});

test('rejecting the approval provably sends nothing', async () => {
  test.setTimeout(900_000);

  rejectLoopId = await createLoop(
    'Compose a one-sentence status update from README.md and deliver it. One pass, then complete.',
    'webhook-post',
    { 'https://…': `http://127.0.0.1:${listenerPort}/reject-hook` },
  );
  await panel().getByRole('button', { name: 'Activate workflow' }).click();
  await expect(panel().getByText('Attempt history')).toBeVisible({ timeout: 20_000 });

  await expect
    .poll(() => loopFile(rejectLoopId)?.runtime.pendingInput?.questions[0]?.kind ?? null,
      { timeout: 600_000, intervals: [5_000] })
    .toBe('approval');
  await answerApproval(rejectLoopId, 'reject');

  // The loop settles (any terminal-ish state is fine) WITHOUT completing.
  await expect
    .poll(() => {
      const status = readJson<OrchestratorIndex>(path.join(stateDir, 'index.json'))?.loops.find((l) => l.id === rejectLoopId)?.status;
      const lastRun = runsIndex(rejectLoopId)?.runs.at(-1)?.status;
      return status !== 'active' || /completed|blocked|failed|waiting/.test(lastRun ?? '') ? { status } : null;
    }, { timeout: 600_000, intervals: [5_000] })
    .not.toBeNull();
  await shot('05-rejected-loop-settled.png');

  // The hard guarantees: nothing arrived, nothing delivered, never "complete".
  expect(received.filter((r) => r.path === '/reject-hook')).toHaveLength(0);
  expect(loopFile(rejectLoopId)?.runtime.deliveries ?? []).toHaveLength(0);
  expect(readJson<OrchestratorIndex>(path.join(stateDir, 'index.json'))?.loops.find((l) => l.id === rejectLoopId)?.status)
    .not.toBe('complete');
});

test('cleanup: delete the test loops', async () => {
  test.setTimeout(120_000);
  // Same seam the UI's dispatch uses (appAgent.invokeTool), so no dependency
  // on which loop detail happens to be open.
  const ids = readJson<OrchestratorIndex>(path.join(stateDir, 'index.json'))?.loops.map((l) => l.id) ?? [];
  for (const id of ids) {
    await page.evaluate(
      ({ workspaceId, loopId }) =>
        window.sero.appAgent.invokeTool('orchestrator', workspaceId, 'orchestrator', { action: 'delete', loopId }),
      { workspaceId: wsId, loopId: id },
    );
  }
  await expect
    .poll(() => readJson<OrchestratorIndex>(path.join(stateDir, 'index.json'))?.loops.length ?? -1, { timeout: 15_000 })
    .toBe(0);
});
