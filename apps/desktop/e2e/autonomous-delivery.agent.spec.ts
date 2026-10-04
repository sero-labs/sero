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
 * SERO_DELIVERY_CAP (USD, default 5), SERO_DELIVERY_MINUTES (default 60),
 * SERO_DELIVERY_GOAL (a smaller request makes a shorter run) and
 * SERO_DELIVERY_QUIET_MINUTES (default 8): the run ends when the project record
 * has not changed for that long, so a frozen run costs minutes, not the hour.
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
const QUIET_MINUTES = Number(process.env.SERO_DELIVERY_QUIET_MINUTES ?? '8');
const GOAL = process.env.SERO_DELIVERY_GOAL ?? 'A small browser synth I can play with my computer keyboard. One octave on the A to K keys, a waveform switch, attack and release, volume, and a visualizer.';

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

/** Goes from the Work view back to the overview by the trail. Says why if it cannot. */
async function backToOverview(name: string): Promise<void> {
  const crumb = page.locator('.ar-crumb').getByRole('button', { name });
  if (!(await crumb.isVisible().catch(() => false))) return;
  try {
    await crumb.click({ timeout: 10_000 });
    await page.locator('.ar-stateline').waitFor({ timeout: 10_000 });
  } catch (error) {
    const onTop = await crumb.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return `${top?.tagName ?? 'none'}.${top?.className ?? ''} body pointer-events=${getComputedStyle(document.body).pointerEvents}`;
    }).catch(() => 'crumb gone');
    console.log(`[delivery] could not return to the overview: ${String(error).split('\n').slice(0, 6).join(' | ')} | on top: ${onTop}`);
  }
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
      // Every session event of the run, kept beside the screenshots.
      SERO_DEBUG_DIR: path.join(SHOTS, 'debug'),
    },
  }));
  const log = fs.createWriteStream(path.join(SHOTS, 'app.log'), { flags: 'w' });
  for (const stream of [app.process().stdout, app.process().stderr]) stream?.pipe(log);
  page.on('pageerror', (error) => console.log(`[delivery] page error: ${String(error).slice(0, 300)}`));
  await waitForShell(page);
  fs.rmSync(path.join(SHOTS, 'debug'), { recursive: true, force: true });
  await page.evaluate(async () => {
    const debug = (window as unknown as { sero?: { debug?: { getState(): Promise<boolean>; toggle(): Promise<boolean> } } }).sero?.debug;
    if (debug && !(await debug.getState())) await debug.toggle();
  });

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

/** Keeps the project records and every session log, so a run that fails can be read afterwards. */
function keepState(): void {
  const out = path.join(SHOTS, 'state');
  fs.rmSync(out, { recursive: true, force: true });
  const stack = [home.path];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.git')) stack.push(file);
        continue;
      }
      const record = dir.endsWith(path.join('architect', 'projects')) && entry.name.endsWith('.json');
      if (!record && !entry.name.endsWith('.jsonl')) continue;
      const target = path.join(out, path.relative(home.path, file));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(file, target);
    }
  }
}

test.afterAll(async () => {
  try {
    if (app) await closeSeroApp(app);
  } finally {
    try {
      if (home) keepState();
    } finally {
      home?.cleanup();
    }
  }
});

test('a short goal with a start cap is delivered, and the work is visible while it runs', async () => {
  test.setTimeout((MAX_MINUTES + 10) * 60_000);
  const startedAt = Date.now();
  const name = `pocket-synth-${startedAt}`;
  const seen = { liveRows: 0, liveText: 0, decisionsAnswered: 0, hostPrompts: 0, orchestratorOpenMs: null as number | null, states: new Set<string>() };

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
  let awaySince: number | null = null;
  let lastState = '';
  let changedAt = Date.now();
  let frozenFor = 0;
  while (Date.now() < deadline) {
    const record = read();
    if (delivered(record)) break;
    const stateNow = JSON.stringify(record);
    if (stateNow !== lastState) {
      lastState = stateNow;
      changedAt = Date.now();
    } else if (Date.now() - changedAt > QUIET_MINUTES * 60_000) {
      frozenFor = Math.round((Date.now() - changedAt) / 60_000);
      console.log(`[delivery] the record did not change for ${frozenFor} min; the run is ended as frozen`);
      break;
    }
    if (record.blockedReason || record.overlay === 'limited') break;
    seen.hostPrompts += await approvePrompts();
    // A preview check shows the app in Explorer to capture it. The user lets it
    // finish, and goes back to the Architect page only when the view stays away.
    if (await page.locator('.ar-app').isVisible().catch(() => false)) awaySince = null;
    else if (awaySince === null) awaySince = Date.now();
    else if (Date.now() - awaySince > 45_000) {
      await page.evaluate(() => (window as unknown as { __appControl?: { openApp(id: string): void } }).__appControl?.openApp('architect'));
      await page.waitForTimeout(1_000);
      awaySince = null;
    }

    await backToOverview(name);

    // A decision keeps its recommended option selected. Answering it is the user's choice, not a hint.
    const answer = page.getByRole('button', { name: 'Answer', exact: true }).first();
    if (await answer.isVisible().catch(() => false)) {
      await shot(`decision-${seen.decisionsAnswered + 1}`);
      await answer.click({ timeout: 10_000 }).catch(() => undefined);
      seen.decisionsAnswered += 1;
    }

    const state = await page.locator('.ar-stateline .ar-activity').first().innerText({ timeout: 3_000 }).catch(() => '');
    const line = state.replace(/\s+/g, ' ').trim();
    if (line && !seen.states.has(line.replace(/\d+[smh]? ago|just now|\d+:\d+/g, ''))) {
      seen.states.add(line.replace(/\d+[smh]? ago|just now|\d+:\d+/g, ''));
      console.log(`[delivery] ${Math.round((Date.now() - startedAt) / 1000)}s $${record.budget.spentUsd.toFixed(3)} ${line}`);
    }

    // Every few passes, open Watch work and look at what is running now.
    if (tick % 6 === 3) {
      const watch = page.getByRole('button', { name: 'Watch work' });
      if (await watch.isVisible().catch(() => false)) {
        await watch.click({ timeout: 10_000 }).catch(() => undefined);
        await page.waitForTimeout(1_500);
        const eyes = page.getByRole('button', { name: /^Watch / });
        const rows = await eyes.count().catch(() => 0);
        if (rows > 0) {
          seen.liveRows += 1;
          await eyes.first().click({ timeout: 10_000 }).catch(() => undefined);
          await page.waitForTimeout(4_000);
          const text = await page.locator('[data-slot="live-block"]').first().innerText().catch(() => '');
          if (text.replace(/\s+/g, '').length > 20) seen.liveText += 1;
          if (seen.liveRows <= 12) await shot(`live-${String(seen.liveRows).padStart(2, '0')}`);
        }
        // One press on the link to the running Workflow or Room opens the Orchestrator.
        const openLink = page.getByRole('button', { name: /^Open (Workflow|Room)/ }).first();
        if (seen.orchestratorOpenMs === null && await openLink.isVisible().catch(() => false)) {
          const pressed = Date.now();
          await openLink.click({ timeout: 10_000 });
          const active = () => page.evaluate(() => (window as unknown as { __appControl?: { getActive(): string } }).__appControl?.getActive());
          const opened = await expect.poll(active, { timeout: 30_000, intervals: [100] }).toBe('orchestrator').then(() => true, () => false);
          seen.orchestratorOpenMs = opened ? Date.now() - pressed : -1;
          console.log(`[delivery] one press on the Orchestrator link: ${opened ? `opened in ${seen.orchestratorOpenMs} ms` : 'did not open in 30 s'}`);
          await page.evaluate(() => (window as unknown as { __appControl?: { openApp(id: string): void } }).__appControl?.openApp('architect'));
          await page.locator('.ar-app').waitFor({ timeout: 30_000 }).catch(() => undefined);
        }
        // The trail's own link back to the overview. The sidebar has a workspace of the same name.
        await backToOverview(name);
      }
    }
    if (tick % 12 === 0) await shot(`overview-${String(tick).padStart(3, '0')}`);
    tick += 1;
    await page.waitForTimeout(5_000);
  }

  // ── What happened, as the record and the screen say it. ──
  const record = read();
  // A preview check can take the view at the moment the run ends, and can take
  // it again. Go back to the overview until it stays.
  await expect.poll(async () => {
    if (!(await page.locator('.ar-app').isVisible().catch(() => false))) {
      await page.evaluate(() => (window as unknown as { __appControl?: { openApp(id: string): void } }).__appControl?.openApp('architect'));
    }
    await backToOverview(name);
    return page.locator('.ar-stateline').isVisible().catch(() => false);
  }, { timeout: 120_000, intervals: [5_000], message: 'the overview did not show after the run ended' }).toBe(true);
  const finalOverview = (await page.locator('.ar-stateline').innerText()).replace(/\s+/g, ' ').trim();
  await shot('90-final-overview');
  for (const tab of ['Watch work'] as const) await page.getByRole('button', { name: tab }).click({ timeout: 10_000 }).catch(() => undefined);
  for (const tab of ['Plan', 'Research', 'Evidence'] as const) {
    await page.getByRole('tab', { name: tab }).click({ timeout: 10_000 }).catch(() => undefined);
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
    frozenMinutes: frozenFor,
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
    watch: { timesRowsWereLive: seen.liveRows, timesLiveTextWasShown: seen.liveText, orchestratorOpenMs: seen.orchestratorOpenMs },
    statesSeen: [...seen.states],
    finalOverview,
    files: fs.existsSync(record.folder) ? fs.readdirSync(record.folder).filter((entry) => !entry.startsWith('.')) : [],
  };
  fs.writeFileSync(path.join(SHOTS, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`[delivery] ${JSON.stringify(result, null, 2)}`);

  expect(record.budget.spentUsd, 'spend is over the start cap').toBeLessThanOrEqual(CAP_USD);
  expect(seen.liveRows, 'Watch work never showed a running row before the result').toBeGreaterThan(0);
  expect(result.delivered, `the run did not deliver: ${record.blockedReason ?? record.stateLine}`).toBe(true);
  // A delivered request with no other work open says so first, and says nothing is still running.
  if (record.milestones.every((milestone) => milestone.status === 'done')) expect(finalOverview).toContain('Delivered');
  expect(finalOverview).not.toMatch(/(?<!Nothing )is running/);
});
