/**
 * One fresh request through the Architect, driven the way a user drives it:
 * the intake dialog, the host's start approval, the overview and the Work view.
 *
 * The request is a short goal with a start cap. There is no solution plan and
 * no instruction to a worker. The spec answers a decision with the option the
 * Architect recommends, counts each one, and records what the run did: its
 * route, its checks, its spend and its time. The delivered files are left in
 * place and their path is recorded, so they can be opened and checked.
 *
 * It spends real money, so it is gated:
 *
 *   env -u ELECTRON_RUN_AS_NODE SERO_E2E_AUTONOMOUS_DELIVERY=1 \
 *     npx playwright test e2e/autonomous-delivery.agent.spec.ts --project=agent
 *
 * Optional: SERO_DELIVERY_MODEL (default deepseek/deepseek-flash:high),
 * SERO_DELIVERY_CAP (USD, default 5), SERO_DELIVERY_MINUTES (default 60).
 * Results are written to e2e/screenshots/autonomous-delivery/.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, createTempSeroHome, launchSeroApp, type TempSeroHome } from './helpers';
import { seedWorkflowProfile, waitForShell } from './helpers/workflow';

const ENABLED = process.env.SERO_E2E_AUTONOMOUS_DELIVERY === '1';
const MODEL = process.env.SERO_DELIVERY_MODEL ?? 'deepseek/deepseek-flash:high';
const CAP_USD = Number(process.env.SERO_DELIVERY_CAP ?? '5');
const MAX_MINUTES = Number(process.env.SERO_DELIVERY_MINUTES ?? '60');
const SHOTS = path.resolve(__dirname, 'screenshots', 'autonomous-delivery');
/** Workspaces must sit under the real home directory. The folder is kept after the run. */
const PROJECTS_ROOT = path.join(os.homedir(), '.sero-e2e-delivery');
const GOAL = 'A small browser synth I can play with my computer keyboard. One octave on the A to K keys, a waveform switch, attack and release, volume, and a visualizer.';

interface DeliveryRecord {
  id: string;
  phase: string;
  overlay: string | null;
  paused: boolean;
  blockedReason: string | null;
  folder: string;
  workspaceId: string | null;
  stateLine: string;
  agreement?: { capUsd: number; approvedAt: string | null };
  overview?: Record<string, { text: string }>;
  working?: { revision: number; objective: string; criteria: { text: string; gap?: string }[] };
  budget: { capUsd: number | null; spentUsd: number; incomplete?: boolean; sources: Record<string, number> };
  decisions: { id: string; question: string; answer: { optionId: string } | null }[];
  milestones: { id: string; title: string; status: string; verification: string | null; dispatch: { kind: string; id: string; failure?: string } | null; evidence: unknown }[];
  research: { id: string; question: string }[];
  pendingResearch?: { id: string }[];
  runs?: { id: string; outcome: string }[];
  session: { turns: number };
}

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** The plugin's global state dir, wherever the profile put it. */
function architectDir(root: string): string | null {
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    if (path.basename(dir) === 'architect' && path.basename(path.dirname(dir)) === 'apps') return dir;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.git')) stack.push(path.join(dir, entry.name));
    }
  }
  return null;
}

function records(): DeliveryRecord[] {
  const dir = architectDir(home.path);
  if (!dir || !fs.existsSync(path.join(dir, 'projects'))) return [];
  return fs.readdirSync(path.join(dir, 'projects'))
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => readJson<DeliveryRecord>(path.join(dir, 'projects', name)) ?? []);
}

async function shot(name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }).catch(() => undefined);
}

/** Answers the host's own permission prompts, the way a user does. Returns how many. */
async function approvePrompts(): Promise<number> {
  let answered = 0;
  for (const name of ['Allow', 'Approve'] as const) {
    const buttons = page.getByRole('button', { name });
    const count = await buttons.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index);
      if (!(await button.isVisible().catch(() => false))) continue;
      await button.click({ timeout: 10_000 }).catch(() => undefined);
      answered += 1;
    }
  }
  return answered;
}

const delivered = (record: DeliveryRecord): boolean => (record.runs ?? []).some((run) => run.outcome === 'delivered');

test.describe.configure({ mode: 'serial' });
test.skip(!ENABLED, 'Set SERO_E2E_AUTONOMOUS_DELIVERY=1 to run one real delivery. It spends real money.');

test.beforeAll(async () => {
  test.setTimeout(300_000);
  const provider = MODEL.split('/')[0] ?? '';
  const keyName = `${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`;
  const key = process.env[keyName];
  if (!key) throw new Error(`${keyName} is not set. The run needs a credential for ${MODEL}.`);
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(PROJECTS_ROOT, { recursive: true });
  home = createTempSeroHome();
  // A fresh profile has no model chosen for any tier, and a planner that finds
  // none refuses. The app keeps the profile here, so the selection is seeded here.
  const profilePath = path.join(home.path, '.sero-ui', 'profiles', 'workflow-test');
  seedWorkflowProfile(home, { profilePath });
  const [reference, thinkingLevel = 'high'] = MODEL.split(':');
  const tier = { provider, modelId: (reference ?? '').slice(provider.length + 1), thinkingLevel };
  fs.writeFileSync(path.join(profilePath, 'agent', 'settings.json'), `${JSON.stringify({ sero: { modelTiers: { LOW: tier, MED: tier, HIGH: tier } } }, null, 2)}\n`);
  ({ app, page } = await launchSeroApp({
    seroHome: home.path,
    runtime: 'host',
    env: {
      // The seeded profile. HOME stays real, so the project folder and the git identity do.
      SERO_FIXED_ROOT_OVERRIDE: path.join(home.path, '.sero-ui'),
      [keyName]: key,
      // One model for the owner and for every agent it starts.
      SERO_ARCHITECT_MODEL: MODEL,
    },
  }));
  const log = fs.createWriteStream(path.join(SHOTS, 'app.log'), { flags: 'w' });
  for (const stream of [app.process().stdout, app.process().stderr]) stream?.pipe(log);
  await waitForShell(page);

  // The intake's Location control opens a native folder dialog, which a test
  // cannot press. The handler in main is replaced, so the dialog's own button
  // still runs and the folder still comes back through the real bridge.
  await app.evaluate(({ ipcMain }, folder) => {
    ipcMain.removeHandler('sero:workspace:pick-folder');
    ipcMain.handle('sero:workspace:pick-folder', () => folder);
  }, PROJECTS_ROOT);

  // The catalogue fills in the background. Fail here with the reason, not inside the first turn.
  const listIds = (): Promise<string[]> => page.evaluate(async () => {
    const bridge = (window as unknown as { sero?: { models?: { list: () => Promise<{ provider: string; models: { modelId: string }[] }[]> } } }).sero?.models;
    const groups = bridge ? await bridge.list() : [];
    return groups.flatMap((group) => group.models.map((model) => `${group.provider}/${model.modelId}`));
  });
  await expect.poll(listIds, { timeout: 120_000, intervals: [3_000], message: `${MODEL} is not in the model catalogue of this profile` }).toContain(MODEL.split(':')[0]);
});

test.afterAll(async () => {
  try {
    if (app) await closeSeroApp(app);
  } finally {
    home?.cleanup();
  }
});

test('a short goal with a start cap is delivered, and the work is visible while it runs', async () => {
  test.setTimeout((MAX_MINUTES + 10) * 60_000);
  const startedAt = Date.now();
  const name = `pocket-synth-${startedAt}`;
  const seen = { liveRows: 0, liveText: 0, decisionsAnswered: 0, hostPrompts: 0, states: new Set<string>() };

  // ── Intake: the goal, the place and the start cap. Nothing else is asked. ──
  await page.evaluate(() => (window as unknown as { __appControl?: { openApp(id: string): void } }).__appControl?.openApp('architect'));
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('What do you want?')).toBeVisible();

  // An empty request is named, and nothing is created.
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Tell Architect what you want.');
  // A refusal reads as one: the same colour the host uses for an error.
  expect(await dialog.getByRole('alert').evaluate((node) => getComputedStyle(node).color)).not.toBe(await dialog.getByLabel('What do you want?').evaluate((node) => getComputedStyle(node.closest('.ar-field')!.querySelector('label')!).color));
  expect(records()).toHaveLength(0);

  await dialog.getByLabel('What do you want?').fill(GOAL);
  await dialog.locator('#ar-name').fill(name);
  await dialog.locator('#ar-location').click();
  await expect(dialog.locator('#ar-location')).toContainText('.sero-e2e-delivery');
  await expect(dialog.locator('#ar-cap')).toHaveValue('5');
  await dialog.locator('#ar-cap').fill(String(CAP_USD));
  await shot('01-intake');
  await dialog.getByRole('button', { name: 'Continue' }).click();

  // ── The start approval is the host's own prompt. Paid work waits for it. ──
  let asked = Date.now();
  await expect.poll(async () => {
    const answered = await approvePrompts();
    seen.hostPrompts += answered;
    if (answered > 0) asked = Date.now();
    // A prompt that closed unanswered leaves the project not started. The page
    // offers the prompt again, and a user presses that.
    const review = page.getByRole('button', { name: 'Review access' });
    if (answered === 0 && Date.now() - asked > 20_000 && await review.isVisible().catch(() => false)) {
      await shot('01b-not-started');
      await review.click().catch(() => undefined);
      asked = Date.now();
    }
    return records()[0]?.agreement?.approvedAt ?? null;
  }, { timeout: 180_000, intervals: [2_000], message: 'the start was never approved' }).not.toBeNull();
  const projectId = records()[0]!.id;
  const read = (): DeliveryRecord => records().find((record) => record.id === projectId)!;
  expect(read().folder).toBe(path.join(PROJECTS_ROOT, name));
  expect(read().budget.capUsd).toBe(CAP_USD);
  await expect(page.getByText(`start cap`)).toBeVisible({ timeout: 30_000 });
  await shot('02-started');

  // ── Follow the run. The user's part is prompts and recommended answers only. ──
  const deadline = startedAt + MAX_MINUTES * 60_000;
  let tick = 0;
  while (Date.now() < deadline) {
    const record = read();
    if (delivered(record)) break;
    if (record.blockedReason || record.overlay === 'limited') break;
    seen.hostPrompts += await approvePrompts();

    // A decision keeps its recommended option selected. Answering it is the user's choice, not a hint.
    const answer = page.getByRole('button', { name: 'Answer', exact: true }).first();
    if (await answer.isVisible().catch(() => false)) {
      await shot(`decision-${seen.decisionsAnswered + 1}`);
      await answer.click().catch(() => undefined);
      seen.decisionsAnswered += 1;
    }

    const state = await page.locator('.ar-stateline .ar-activity').first().innerText().catch(() => '');
    const line = state.replace(/\s+/g, ' ').trim();
    if (line && !seen.states.has(line.replace(/\d+[smh]? ago|just now|\d+:\d+/g, ''))) {
      seen.states.add(line.replace(/\d+[smh]? ago|just now|\d+:\d+/g, ''));
      console.log(`[delivery] ${Math.round((Date.now() - startedAt) / 1000)}s $${record.budget.spentUsd.toFixed(3)} ${line}`);
    }

    // Every few passes, open Watch work and look at what is running now.
    if (tick % 6 === 3) {
      const watch = page.getByRole('button', { name: 'Watch work' });
      if (await watch.isVisible().catch(() => false)) {
        await watch.click();
        await page.waitForTimeout(1_500);
        const eyes = page.getByRole('button', { name: /^Watch / });
        const rows = await eyes.count().catch(() => 0);
        if (rows > 0) {
          seen.liveRows += 1;
          await eyes.first().click().catch(() => undefined);
          await page.waitForTimeout(4_000);
          const text = await page.locator('[data-slot="live-block"]').first().innerText().catch(() => '');
          if (text.replace(/\s+/g, '').length > 20) seen.liveText += 1;
          if (seen.liveRows <= 3) await shot(`live-${seen.liveRows}`);
        }
        await page.getByRole('button', { name }).first().click().catch(() => undefined);
      }
    }
    if (tick % 12 === 0) await shot(`overview-${String(tick).padStart(3, '0')}`);
    tick += 1;
    await page.waitForTimeout(5_000);
  }

  // ── What happened, as the record and the screen say it. ──
  const record = read();
  await shot('90-final-overview');
  for (const tab of ['Watch work'] as const) await page.getByRole('button', { name: tab }).click().catch(() => undefined);
  for (const tab of ['Plan', 'Research', 'Evidence'] as const) {
    await page.getByRole('tab', { name: tab }).click().catch(() => undefined);
    await page.waitForTimeout(800);
    await shot(`91-work-${tab.toLowerCase()}`);
  }
  const result = {
    model: MODEL,
    goal: GOAL,
    folder: record.folder,
    delivered: delivered(record),
    phase: record.phase,
    blockedReason: record.blockedReason,
    minutes: Number(((Date.now() - startedAt) / 60_000).toFixed(1)),
    capUsd: record.budget.capUsd,
    spentUsd: record.budget.spentUsd,
    spendIncomplete: record.budget.incomplete ?? null,
    spendSources: record.budget.sources,
    ownerTurns: record.session.turns,
    route: record.milestones.map((milestone) => ({ title: milestone.title, kind: milestone.dispatch?.kind ?? null, status: milestone.status, verification: milestone.verification, failure: milestone.dispatch?.failure ?? null, checked: Boolean(milestone.evidence) })),
    research: record.research.map((entry) => entry.question),
    criteria: record.working?.criteria ?? [],
    overview: Object.fromEntries(Object.entries(record.overview ?? {}).map(([field, value]) => [field, value.text])),
    stateLine: record.stateLine,
    decisions: record.decisions.map((decision) => ({ question: decision.question, answered: decision.answer?.optionId ?? null })),
    userActions: { hostPrompts: seen.hostPrompts, decisionsAnswered: seen.decisionsAnswered, notesSent: 0 },
    watch: { timesRowsWereLive: seen.liveRows, timesLiveTextWasShown: seen.liveText },
    statesSeen: [...seen.states],
    files: fs.existsSync(record.folder) ? fs.readdirSync(record.folder).filter((entry) => !entry.startsWith('.')) : [],
  };
  fs.writeFileSync(path.join(SHOTS, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`[delivery] ${JSON.stringify(result, null, 2)}`);

  expect(record.budget.spentUsd, 'spend is over the start cap').toBeLessThanOrEqual(CAP_USD);
  expect(seen.liveRows, 'Watch work never showed a running row before the result').toBeGreaterThan(0);
  expect(result.delivered, `the run did not deliver: ${record.blockedReason ?? record.stateLine}`).toBe(true);
});
