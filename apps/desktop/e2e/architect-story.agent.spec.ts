/**
 * One real Architect project, followed the way a user follows it, with a
 * screenshot at each main stage: the request, the start approval, the board
 * while research runs, each decision, each step that starts, each step that is
 * checked, and the result. The screenshots and a timeline of what the board
 * said are the output. The run asserts little: it exists so the user story can
 * be judged from what the screen showed.
 *
 * It uses a profile that outlives the run, with its model tiers already set.
 * It spends real money, so it is gated:
 *
 *   env -u ELECTRON_RUN_AS_NODE SERO_E2E_ARCHITECT_STORY=1 \
 *     npx playwright test e2e/architect-story.agent.spec.ts --project=agent
 *
 * Optional: SERO_STORY_HOME (default apps/desktop/.sero-ux-home),
 * SERO_STORY_GOAL, SERO_STORY_CAP (USD, default 3), SERO_STORY_MINUTES
 * (default 45) and SERO_STORY_QUIET_MINUTES (default 8). SERO_STORY_LOOK=1 starts
 * no work: it pictures the board of the project the last run left, into look/.
 * Results are written to e2e/screenshots/architect-story/.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, launchSeroApp } from './helpers';
import { waitForShell } from './helpers/workflow';

const ENABLED = process.env.SERO_E2E_ARCHITECT_STORY === '1';
/** Pictures the board of the project the last run left, and starts no work. */
const LOOK = process.env.SERO_STORY_LOOK === '1';
/** Without this the run leaves a dangerous-command prompt unanswered, and ends when nothing changes. */
const ALLOW_DANGEROUS = process.env.SERO_STORY_ALLOW_DANGEROUS === '1';
/** Not under `.sero-e2e`: the Playwright global setup deletes that tree before every run. */
const HOME = process.env.SERO_STORY_HOME ?? path.resolve(__dirname, '..', '.sero-ux-home');
const CAP_USD = Number(process.env.SERO_STORY_CAP ?? '3');
const MAX_MINUTES = Number(process.env.SERO_STORY_MINUTES ?? '45');
const QUIET_MINUTES = Number(process.env.SERO_STORY_QUIET_MINUTES ?? '8');
const SHOTS = path.resolve(__dirname, 'screenshots', 'architect-story');
/** Workspaces must sit under the real home directory. The folder is kept after the run. */
const PROJECTS_ROOT = path.join(os.homedir(), '.sero-ux-projects');
const GOAL = process.env.SERO_STORY_GOAL ?? [
  'A Sudoku game that runs in the browser. A new game at three difficulty levels, a 9 by 9 grid I can fill by clicking or with the keyboard,',
  'wrong numbers shown as wrong, a timer, and a message when I solve it.',
  'First have a Room of agents agree the design and how the puzzles are made. Then build it with a Workflow.',
].join(' ');

interface StoryRecord {
  id: string;
  name: string;
  phase: string;
  overlay: string | null;
  paused: boolean;
  blockedReason: string | null;
  folder: string;
  stateLine: string;
  agreement?: { approvedAt: string | null };
  budget: { capUsd: number | null; spentUsd: number; sources: Record<string, number> };
  decisions: { id: string; question: string; answer: { optionId: string } | null }[];
  milestones: { id: string; title: string; status: string; dispatch: { kind: string; id: string; failure?: string } | null; evidence: unknown }[];
  research: { id: string; question: string; models?: { name: string; model: string; thinking: string }[] }[];
  pendingResearch?: { id: string; kind?: string; roomId?: string; workflowId?: string }[];
  runs?: { outcome?: string }[];
  session: { turns: number; model?: string | null; thinking?: string | null };
}

let app: ElectronApplication;
let page: Page;
let startedAt = 0;
let shots = 0;
let dangerSeen = false;
const timeline: { at: number; shot: string | null; event: string; board: string }[] = [];

const seconds = (): number => Math.round((Date.now() - startedAt) / 1000);
const openArchitect = (): Promise<void> => page.evaluate(() => (window as unknown as { __appControl?: { openApp(id: string): void } }).__appControl?.openApp('architect'));
const activeApp = (): Promise<string | undefined> => page.evaluate(() => (window as unknown as { __appControl?: { getActive(): string } }).__appControl?.getActive());

function records(): StoryRecord[] {
  const dir = path.join(HOME, 'profiles', 'architectuxrun', 'apps', 'architect', 'projects');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith('.json')).flatMap((name) => {
    try {
      return [JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as StoryRecord];
    } catch {
      return [];
    }
  });
}

/** What the top tile says: the Architect's sentence and the state line. */
async function boardText(): Promise<string> {
  const text = await page.locator('.bd-hero').first().innerText({ timeout: 2_000 }).catch(() => '');
  return text.replace(/\s+/g, ' ').trim();
}

/** One numbered screenshot, and one line of the timeline that says why it was taken. */
async function stage(event: string, slug?: string): Promise<void> {
  let file: string | null = null;
  if (slug) {
    shots += 1;
    file = `${String(shots).padStart(2, '0')}-${slug}.png`;
    await page.screenshot({ path: path.join(SHOTS, file) }).catch(() => undefined);
  }
  const board = await boardText();
  timeline.push({ at: seconds(), shot: file, event, board });
  console.log(`[story] ${seconds()}s ${file ?? '-'} ${event}${board ? ` | ${board.slice(0, 160)}` : ''}`);
  fs.writeFileSync(path.join(SHOTS, 'timeline.json'), `${JSON.stringify(timeline, null, 2)}\n`);
}

/** Answers the host's own permission prompts, the way a user does. The first of each batch is kept as a picture. */
async function approvePrompts(): Promise<number> {
  let answered = 0;
  for (const name of ['Allow', 'Approve'] as const) {
    const buttons = page.getByRole('button', { name });
    const count = await buttons.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index);
      if (!(await button.isVisible().catch(() => false))) continue;
      // A command the host calls dangerous is the user's to judge. It is pictured once and left open.
      if (!ALLOW_DANGEROUS && await page.getByText('dangerous command').first().isVisible().catch(() => false)) {
        if (!dangerSeen) await stage('the host asks about a dangerous command; it is left for the user', 'dangerous-prompt');
        dangerSeen = true;
        return answered;
      }
      dangerSeen = false;
      if (answered === 0) await stage('the host asks for permission', 'host-prompt');
      await button.click({ timeout: 10_000 }).catch(() => undefined);
      answered += 1;
    }
  }
  return answered;
}

/** Back to the board from a page under the project, by the trail. */
async function backToBoard(name: string): Promise<void> {
  if (await activeApp() !== 'architect') {
    await openArchitect();
    await page.locator('.ar-app').waitFor({ timeout: 30_000 }).catch(() => undefined);
  }
  const crumb = page.locator('.ar-crumb').getByRole('button', { name });
  if (await crumb.isVisible().catch(() => false)) await crumb.click({ timeout: 10_000 }).catch(() => undefined);
  // Architect can reopen on the list of projects. A user presses the project's row.
  const row = page.locator('.ar-prow').filter({ hasText: name }).first();
  if (await row.isVisible().catch(() => false)) await row.click({ timeout: 10_000 }).catch(() => undefined);
  await page.locator('.bd-hero').first().waitFor({ timeout: 10_000 }).catch(() => undefined);
}

/** Presses the Live tile's link to the running Room or Workflow, pictures the Orchestrator, and comes back. */
async function visitOrchestrator(kind: 'Room' | 'Workflow', name: string): Promise<boolean> {
  const link = page.locator('.bd-live').getByRole('button', { name: `Open the ${kind}` }).first();
  if (!(await link.isVisible().catch(() => false))) return false;
  await link.click({ timeout: 10_000 }).catch(() => undefined);
  const opened = await expect.poll(activeApp, { timeout: 30_000, intervals: [250] }).toBe('orchestrator').then(() => true, () => false);
  await page.waitForTimeout(4_000);
  await stage(opened ? `the ${kind} in the Orchestrator` : `the link to the ${kind} did not open the Orchestrator`, `orchestrator-${kind.toLowerCase()}`);
  await backToBoard(name);
  return opened;
}

const delivered = (record: StoryRecord): boolean => (record.runs ?? []).some((run) => run.outcome === 'delivered');

test.describe.configure({ mode: 'serial' });
test.skip(!ENABLED, 'Set SERO_E2E_ARCHITECT_STORY=1 to run one real project. It spends real money.');

test.beforeAll(async () => {
  test.setTimeout(300_000);
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY is not set.');
  if (!fs.existsSync(path.join(HOME, 'profiles.json'))) throw new Error(`There is no profile at ${HOME}.`);
  if (!LOOK) fs.rmSync(SHOTS, { recursive: true, force: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(PROJECTS_ROOT, { recursive: true });
  ({ app, page } = await launchSeroApp({
    seroHome: HOME,
    runtime: 'host',
    // HOME stays real, so the project folder and the git identity do. No model is pinned: the profile's tiers decide.
    env: { SERO_FIXED_ROOT_OVERRIDE: HOME, DEEPSEEK_API_KEY: key, ...(LOOK ? {} : { SERO_DEBUG_DIR: path.join(SHOTS, 'debug') }) },
    withoutEnv: ['SERO_ARCHITECT_MODEL'],
  }));
  const log = fs.createWriteStream(path.join(SHOTS, LOOK ? 'look.log' : 'app.log'), { flags: 'w' });
  for (const stream of [app.process().stdout, app.process().stderr]) stream?.pipe(log);
  page.on('pageerror', (error) => console.log(`[story] page error: ${String(error).slice(0, 300)}`));
  await waitForShell(page);
  // Every session event of the run, kept beside the screenshots.
  if (!LOOK) fs.rmSync(path.join(SHOTS, 'debug'), { recursive: true, force: true });
  if (!LOOK) await page.evaluate(async () => {
    const debug = (window as unknown as { sero?: { debug?: { getState(): Promise<boolean>; toggle(): Promise<boolean> } } }).sero?.debug;
    if (debug && !(await debug.getState())) await debug.toggle();
  });

  // The intake's Location control opens a native folder dialog, which a test cannot press.
  await app.evaluate(({ ipcMain }, folder) => {
    ipcMain.removeHandler('sero:workspace:pick-folder');
    ipcMain.handle('sero:workspace:pick-folder', () => folder);
  }, PROJECTS_ROOT);

  const listIds = (): Promise<string[]> => page.evaluate(async () => {
    const bridge = (window as unknown as { sero?: { models?: { list: () => Promise<{ provider: string; models: { modelId: string }[] }[]> } } }).sero?.models;
    const groups = bridge ? await bridge.list() : [];
    return groups.flatMap((group) => group.models.map((model) => `${group.provider}/${model.modelId}`));
  });
  await expect.poll(listIds, { timeout: 120_000, intervals: [3_000], message: 'deepseek/deepseek-flash is not in the model catalogue of this profile' }).toContain('deepseek/deepseek-flash');
});

test.afterAll(async () => {
  if (app) await closeSeroApp(app);
});

test('the board of the project the last run left', async () => {
  test.skip(!LOOK, 'Set SERO_STORY_LOOK=1 to picture the last project without starting work.');
  const record = records().sort((a, b) => b.name.localeCompare(a.name))[0];
  expect(record, 'there is no project in this profile').toBeTruthy();
  fs.mkdirSync(path.join(SHOTS, 'look'), { recursive: true });
  await openArchitect();
  await backToBoard(record!.name);
  await page.waitForTimeout(2_500);
  await page.screenshot({ path: path.join(SHOTS, 'look', 'board.png') });
  await page.locator('.bd-made summary').first().click({ timeout: 5_000 }).catch(() => undefined);
  await page.screenshot({ path: path.join(SHOTS, 'look', 'board-decision-open.png') });
});

test('one request, from the first screen to the result, pictured at each stage', async () => {
  test.skip(LOOK, 'SERO_STORY_LOOK=1 pictures the last project only.');
  test.setTimeout((MAX_MINUTES + 15) * 60_000);
  startedAt = Date.now();
  const name = `sudoku-${startedAt}`;
  const before = new Set(records().map((record) => record.id));

  // ── The request ──
  await openArchitect();
  await page.locator('.ar-app').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1_500);
  await stage('Architect, before a project exists', 'architect-home');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('What do you want?').fill(GOAL);
  await dialog.locator('#ar-name').fill(name);
  await dialog.locator('#ar-location').click();
  await expect(dialog.locator('#ar-location')).toContainText('.sero-ux-projects');
  await dialog.locator('#ar-cap').fill(String(CAP_USD));
  await stage('the request is written', 'request');
  await dialog.getByRole('button', { name: 'Continue' }).click();

  // ── The start approval is the host's own prompt. Paid work waits for it. ──
  const mine = (): StoryRecord | undefined => records().find((record) => !before.has(record.id));
  let asked = Date.now();
  await expect.poll(async () => {
    if (await approvePrompts() > 0) asked = Date.now();
    const review = page.getByRole('button', { name: 'Review access' });
    if (Date.now() - asked > 20_000 && await review.isVisible().catch(() => false)) {
      await stage('the project did not start; the page offers the prompt again', 'not-started');
      await review.click().catch(() => undefined);
      asked = Date.now();
    }
    return mine()?.agreement?.approvedAt ?? null;
  }, { timeout: 180_000, intervals: [2_000], message: 'the start was never approved' }).not.toBeNull();
  const read = (): StoryRecord => mine()!;
  await page.locator('.bd-hero').first().waitFor({ timeout: 30_000 }).catch(() => undefined);
  await stage('the project has started', 'started');

  // ── Follow the run. A picture is taken when the record says a stage changed. ──
  const deadline = startedAt + MAX_MINUTES * 60_000;
  const seen = { phase: read().phase, research: new Set<string>(), researchDone: 0, steps: new Set<string>(), checked: new Set<string>(), failed: new Set<string>(), visited: new Set<string>(), live: false, browser: false, several: false, decisions: 0, prompts: 0 };
  let lastState = '';
  let changedAt = Date.now();
  let lastBoard = '';
  let awaySince: number | null = null;
  let ended = 'the time ran out';
  while (Date.now() < deadline) {
    const record = read();
    if (delivered(record)) {
      ended = 'delivered';
      break;
    }
    const stateNow = JSON.stringify(record);
    if (stateNow !== lastState) {
      lastState = stateNow;
      changedAt = Date.now();
    } else if (Date.now() - changedAt > QUIET_MINUTES * 60_000) {
      ended = `the record did not change for ${QUIET_MINUTES} minutes`;
      break;
    }
    seen.prompts += await approvePrompts();

    // A preview check shows the app in Explorer to capture it. The user lets it finish.
    if (await page.locator('.ar-app').isVisible().catch(() => false)) awaySince = null;
    else if (awaySince === null) {
      awaySince = Date.now();
      await stage(`the view left Architect for ${await activeApp() ?? 'another app'}`, 'view-taken');
    } else if (Date.now() - awaySince > 45_000) awaySince = null;
    if (awaySince !== null) {
      await page.waitForTimeout(3_000);
      continue;
    }
    await backToBoard(name);

    if (record.phase !== seen.phase) {
      seen.phase = record.phase;
      await stage(`the phase is now ${record.phase}`, `phase-${record.phase}`);
    }

    // A decision is answered with the option the Architect suggests, as a user who trusts it does.
    const ask = page.locator('section[aria-label="Needs you"]');
    if (await ask.isVisible().catch(() => false)) {
      seen.decisions += 1;
      await stage(`decision ${seen.decisions} is open`, `decision-${seen.decisions}`);
      const suggested = ask.locator('.bd-opt').filter({ hasText: 'Architect suggests this' }).first();
      const option = await suggested.isVisible().catch(() => false) ? suggested : ask.locator('.bd-opt').first();
      await option.click({ timeout: 10_000 }).catch(() => undefined);
      await page.waitForTimeout(2_500);
      await stage(`decision ${seen.decisions} is answered`, `decision-${seen.decisions}-answered`);
    }

    for (const research of record.pendingResearch ?? []) {
      if (seen.research.has(research.id)) continue;
      seen.research.add(research.id);
      await page.waitForTimeout(3_000);
      await stage(`research started as a ${research.kind ?? 'Room'}`, `research-${research.kind ?? 'room'}-started`);
    }
    if (record.research.length > seen.researchDone) {
      seen.researchDone = record.research.length;
      await stage(`research result ${seen.researchDone} came back`, `research-${seen.researchDone}-back`);
    }
    for (const step of record.milestones) {
      const kind = step.dispatch?.kind;
      if (kind && !seen.steps.has(step.id)) {
        seen.steps.add(step.id);
        await page.waitForTimeout(3_000);
        await stage(`step "${step.title}" started as a ${kind}`, `step-${kind}-started`);
      }
      if (step.dispatch?.failure && !seen.failed.has(step.id)) {
        seen.failed.add(step.id);
        await stage(`step "${step.title}" stopped: ${step.dispatch.failure}`, 'step-stopped');
      }
      if (step.status === 'done' && step.evidence && !seen.checked.has(step.id)) {
        seen.checked.add(step.id);
        await page.waitForTimeout(2_000);
        await stage(`step "${step.title}" is checked`, 'step-checked');
      }
    }

    // The Live tile: once when it first shows, once with several agents, once with what the browser saw.
    const live = page.locator('.bd-live');
    if (await live.isVisible().catch(() => false)) {
      if (!seen.live) {
        seen.live = true;
        await stage('the Live tile shows work', 'live');
      }
      if (!seen.several && await live.locator('.bd-rows').isVisible().catch(() => false)) {
        seen.several = true;
        await stage('several agents are live', 'live-several');
      }
      if (!seen.browser && await live.locator('.bd-sees').isVisible().catch(() => false)) {
        seen.browser = true;
        await stage('Live shows what Architect last saw in the browser', 'live-browser');
      }
      for (const kind of ['Room', 'Workflow'] as const) {
        if (seen.visited.has(kind)) continue;
        // The second row of several is often the Room or the Workflow. A user presses it to see it.
        const row = live.locator('.bd-row').filter({ hasNotText: 'Architect' }).first();
        if (await row.isVisible().catch(() => false)) await row.click({ timeout: 5_000 }).catch(() => undefined);
        if (await visitOrchestrator(kind, name)) seen.visited.add(kind);
      }
    }

    const board = (await boardText()).replace(/\d+:\d+|\$\d+(\.\d+)?/g, '');
    if (board && board !== lastBoard) {
      lastBoard = board;
      await stage('the board says something new');
    }
    await page.waitForTimeout(4_000);
  }

  // ── The end, as the screen shows it. ──
  const record = read();
  await backToBoard(name);
  await page.waitForTimeout(3_000);
  await stage(`the run ended: ${ended}`, 'end-board');
  for (const [label, slug] of [['Full plan', 'full-plan'], ['Research', 'research'], ['See the proof', 'proof']] as const) {
    const link = page.getByRole('button', { name: label }).first();
    if (!(await link.isVisible().catch(() => false))) continue;
    await link.click({ timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(1_500);
    await stage(`"${label}" from the board`, slug);
    await backToBoard(name);
  }
  await page.locator('.ar-crumb').getByRole('button', { name: 'Back to projects' }).click({ timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(1_500);
  await stage('the list of projects', 'projects-list');

  const result = {
    goal: GOAL,
    ended,
    delivered: delivered(record),
    folder: record.folder,
    minutes: Number(((Date.now() - startedAt) / 60_000).toFixed(1)),
    capUsd: record.budget.capUsd,
    spentUsd: record.budget.spentUsd,
    spendSources: record.budget.sources,
    ownerTurns: record.session.turns,
    ownerModel: `${record.session.model ?? 'unknown'}:${record.session.thinking ?? 'unknown'}`,
    researchModels: record.research.flatMap((entry) => entry.models ?? []),
    phase: record.phase,
    blockedReason: record.blockedReason,
    stateLine: record.stateLine,
    research: record.research.map((entry) => entry.question),
    route: record.milestones.map((step) => ({ title: step.title, kind: step.dispatch?.kind ?? null, status: step.status, failure: step.dispatch?.failure ?? null, checked: Boolean(step.evidence) })),
    decisions: record.decisions.map((decision) => ({ question: decision.question, answered: decision.answer?.optionId ?? null })),
    userActions: { hostPrompts: seen.prompts, decisionsAnswered: seen.decisions },
    orchestratorVisits: [...seen.visited],
    files: fs.existsSync(record.folder) ? fs.readdirSync(record.folder).filter((entry) => !entry.startsWith('.')) : [],
  };
  fs.writeFileSync(path.join(SHOTS, 'record.json'), `${JSON.stringify(record, null, 2)}\n`);
  fs.writeFileSync(path.join(SHOTS, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`[story] ${JSON.stringify(result, null, 2)}`);

  // A project left working wakes on every later launch of this profile. Pause it before the app closes.
  if (!result.delivered && !record.paused) {
    await backToBoard(name);
    await page.locator('.ar-top-actions').getByRole('button').last().click({ timeout: 10_000 }).catch(() => undefined);
    await page.getByRole('menuitem', { name: 'Pause' }).click({ timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(2_000);
    await stage('the project is paused before the app closes', 'paused');
  }
  expect(record.budget.spentUsd, 'spend is over the start cap').toBeLessThanOrEqual(CAP_USD);
});
