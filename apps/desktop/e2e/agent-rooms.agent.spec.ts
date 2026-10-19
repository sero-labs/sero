/**
 * Agent Rooms evaluation (phase 8 acceptance gate).
 *
 * Runs the REAL Room flow — planner call, live member sessions, real spend —
 * because that is the only thing the gate can be decided on. A Room that
 * satisfies every validator can still staff itself badly, talk in circles or
 * finish without delivering, and none of that shows up in a unit test.
 *
 * Four scenarios, one per acceptance question:
 *   1  a generated roster fits the problem, and the work is delivered;
 *   2  an adversarial brief produces opposing roles, not one agreeable team;
 *   3  parallel work gets a checkout each, and overlapping paths are claimed;
 *   4  a Room asked for in a chat returns its result to that chat (FR-029);
 *   5  a running Room changes its team, Sero restarts mid-change, and the grant
 *      and every member's history survive (amendment replay, task 4.8).
 *   6  a change inside the approval (narrowing a member's tools) amends the
 *      grant with no question, and the member keeps its history.
 *
 * Each scenario costs real money and takes minutes, so they are opt-in:
 *
 *   env -u ELECTRON_RUN_AS_NODE SERO_E2E_REAL_HOME=1 SERO_E2E_ROOMS=1 \
 *     npx playwright test e2e/agent-rooms.agent.spec.ts --project=agent
 *
 * Set SERO_E2E_ROOM_SCENARIO=2 to run one of them alone, and SERO_ROOM_MODELS /
 * SERO_ROOM_THINKING to hold the whole run on one model and one effort level.
 * Every run appends what it measured to e2e/screenshots/agent-rooms/
 * evaluation.json — duration, spend, roster, interventions — which is the
 * evidence the gate is decided on.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeSeroApp,
  createTempSeroHome,
  launchSeroApp,
  requireLlmReady,
  getLlmLaunchEnv,
  layout as layoutSel,
  workspace as workspaceSel,
  type TempSeroHome,
} from './helpers';
import { createOpenAgentSession, promptAndCollectEvents } from './helpers/agent';
import { seedWorkflowProfile, waitForShell, createWorkspaceDir } from './helpers/workflow';

const REAL_HOME = process.env.SERO_E2E_REAL_HOME === '1';
/** The gate is opt-in: these scenarios spend real money. */
const ENABLED = process.env.SERO_E2E_ROOMS === '1';
const ONLY = process.env.SERO_E2E_ROOM_SCENARIO ?? 'all';
const SHOTS = path.resolve(__dirname, 'screenshots', 'agent-rooms');
const RESULTS = path.join(SHOTS, 'evaluation.json');

/** Long enough for a real team to finish; a Room that needs more has failed the gate. */
const SCENARIO_TIMEOUT_MS = 25 * 60_000;

const BRIEFS = {
  delivery: [
    'The greeting in src/greet.ts is wrong for an empty name: it says "Hello, !" instead of',
    'greeting the world. Find out why, fix it properly, and leave a test that fails on the old',
    'code. Work in the workspace files; do not open a pull request.',
  ].join(' '),
  adversarial: [
    'We are about to store every user session in one shared in-memory map, keyed by user id, with',
    'no expiry. Argue both sides of that decision properly and tell me which one wins and why.',
    'Write the decision and the case against it to DECISION.md.',
  ].join(' '),
  amend: [
    'The greeting in src/greet.ts is wrong for an empty name: it says "Hello, !" instead of',
    'greeting the world. Start this Room with exactly one member besides the Conductor: a reviewer',
    'who finds the cause and writes it to REVIEW.md, and nothing else. When REVIEW.md exists, the',
    'Conductor must propose a revision that adds one more member, a tester, who fixes src/greet.ts',
    'and leaves a test that fails on the old code. Work in the workspace files; do not open a pull request.',
  ].join(' '),
  narrow: [
    'The greeting in src/greet.ts is wrong for an empty name: it says "Hello, !" instead of',
    'greeting the world. Start this Room with exactly two members besides the Conductor. The first',
    'has the key reviewer and exactly the tools read and write; it finds the cause and writes it to',
    'REVIEW.md, and nothing else. The second has the key fixer; it waits for REVIEW.md, then fixes',
    'src/greet.ts and leaves a test that fails on the old code. When REVIEW.md exists, the Conductor',
    'must take write away from the reviewer, because its review is done, by running exactly:',
    `sero room propose-revision --proposalJson '{"kind":"change-configuration","memberId":"reviewer","configuration":{"tools":["read"]}}' --reason "the review is written"`,
    'Propose no other revision. Work in the workspace files; do not open a pull request.',
  ].join(' '),
  parallel: [
    'Two independent jobs, and they must not wait for each other: add input validation to',
    'src/greet.ts, and separately add a currency formatter to src/money.ts. One person per file.',
    'Leave both changes in the working tree with a test each.',
  ].join(' '),
} as const;

const gate = REAL_HOME ? { skip: false as const } : requireLlmReady();

let home: TempSeroHome | undefined;
let app: ElectronApplication;
let page: Page;
let wsDir: string;
let wsId: string;
let stateDir: string;
let seroHomePath: string;
/** A temp home's own HOME, fixed root and git identity; empty with the real home. */
let homeEnv: Record<string, string> = {};

/** Starts the app on the run's home and keeps what it says beside the screenshots. */
async function launchApp(): Promise<void> {
  ({ app, page } = await launchSeroApp({
    seroHome: seroHomePath,
    runtime: 'host',
    // Rooms are enabled by default. This launch only supplies the model test environment.
    env: { ...(REAL_HOME ? {} : getLlmLaunchEnv()), ...homeEnv },
  }));
  // What the app itself said, kept beside the screenshots. A Room that refuses
  // to start says why in the main process, and a gate run that cannot be
  // explained is not evidence.
  const appLog = fs.createWriteStream(path.join(SHOTS, 'app.log'), { flags: 'a' });
  app.process().stdout?.pipe(appLog);
  app.process().stderr?.pipe(appLog);
  await waitForShell(page);
}

interface RoomIndexFile {
  rooms: { id: string; title: string; status: string; costUsd: number; memberCount: number }[];
}

interface RoomFile {
  definition: { id: string; title: string; envelope: { maxCostUsd: number; maxWallClockMs: number } };
  runtime: {
    status: string;
    startedAt: string | null;
    endedAt: string | null;
    usage: { costUsd: number; turns: number; rosterRevisions: number; memberReplacements: number };
    stopReason: { kind: string; detail: string } | null;
  };
  delivery: { destination: string; originSessionId: string | null; deliveredAt: string | null; deliveryRef: string | null };
  memberIds: string[];
  work: { title: string; status: string }[];
  artifacts: { title: string; kind: string }[];
  claims: { pattern: string; memberId: string; status: string }[];
}

interface MemberFile {
  id: string;
  displayName: string;
  isConductor: boolean;
  status: string;
  mandate: { role: string };
  configuration: { model: string; thinking: string; tools: string[] };
  worktreePath: string | null;
  worktreeBranch: string | null;
  usage: { costUsd: number; turns: number };
}

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

const roomIndex = (): RoomIndexFile | null => readJson<RoomIndexFile>(path.join(stateDir, 'rooms', 'index.json'));
const roomFile = (roomId: string): RoomFile | null => readJson<RoomFile>(path.join(stateDir, 'rooms', roomId, 'room.json'));

function members(roomId: string): MemberFile[] {
  const dir = path.join(stateDir, 'rooms', roomId, 'members');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map((file) => readJson<MemberFile>(path.join(dir, file)))
    .filter((member): member is MemberFile => member !== null);
}

/**
 * Every copy of a workspace file the Room could have written.
 *
 * The default workspace mode gives each editing member its own checkout, so the
 * work lands on a member branch and the shared tree is deliberately untouched
 * until the user merges. Reading only the shared tree would score the Room on
 * something it is designed not to do.
 *
 * A finished Room has released its checkouts, so a member's copy is read from
 * the branch it kept, and `root` names that branch. `matches` picks the files:
 * the brief names no path for a new test, so a pattern finds it wherever it went.
 */
function roomCopiesOf(roomId: string, matches: string | RegExp): { root: string; content: string }[] {
  const wanted = (file: string) => typeof matches === 'string' ? file === matches : matches.test(file);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: wsDir, encoding: 'utf8' });
  const copies = git('ls-files').split('\n').filter(wanted)
    .map((file) => ({ root: wsDir, content: fs.readFileSync(path.join(wsDir, file), 'utf8') }));
  const branches = new Set(members(roomId).map((member) => member.worktreeBranch).filter((branch): branch is string => !!branch));
  for (const branch of branches) {
    const files = (() => { try { return git('ls-tree', '-r', '--name-only', branch).split('\n'); } catch { return []; } })();
    for (const file of files.filter(wanted)) copies.push({ root: branch, content: git('show', `${branch}:${file}`) });
  }
  return copies;
}

interface RevisionAmendment {
  id: string;
  state: string;
  adds: unknown[];
  reason: string | null;
  grantRevision: number | null;
}

/** Every grant amendment the Room has asked for, from its revision history. */
function amendments(roomId: string): RevisionAmendment[] {
  const revisions = readJson<{ id: string; amendment?: Omit<RevisionAmendment, 'id'> }[]>(path.join(stateDir, 'rooms', roomId, 'revisions.json')) ?? [];
  return revisions.filter((revision) => revision.amendment).map((revision) => ({ id: revision.id, ...revision.amendment! }));
}

const roomGrant = (roomId: string): string | null =>
  readJson<{ definition: { grantId: string | null } }>(path.join(stateDir, 'rooms', roomId, 'room.json'))?.definition.grantId ?? null;

/** Each member's session file and how many lines it holds. */
function sessionHistories(roomId: string): Record<string, { sessionPath: string | null; lines: number }> {
  const dir = path.join(stateDir, 'rooms', roomId, 'members');
  const out: Record<string, { sessionPath: string | null; lines: number }> = {};
  for (const file of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const member = readJson<{ id: string; session: { sessionPath: string | null } }>(path.join(dir, file));
    if (!member) continue;
    const sessionPath = member.session?.sessionPath ?? null;
    const lines = sessionPath && fs.existsSync(sessionPath) ? fs.readFileSync(sessionPath, 'utf8').split('\n').filter(Boolean).length : 0;
    out[member.id] = { sessionPath, lines };
  }
  return out;
}

/** Approves a held change through the same `rooms` tool action the Team view's Approve button sends. */
async function approveHeld(roomId: string, revisionId: string): Promise<unknown> {
  return page.evaluate(({ workspaceId, params }) => window.sero.appAgent.invokeTool('orchestrator', workspaceId, 'rooms', params),
    { workspaceId: wsId, params: { action: 'approve_revision', roomId, revisionId } });
}

/** What the gate is decided on. Appended per scenario so a partial run still reports. */
function record(scenario: string, room: RoomFile, roster: MemberFile[], notes: Record<string, unknown>): void {
  const durationMs = room.runtime.startedAt && room.runtime.endedAt
    ? Date.parse(room.runtime.endedAt) - Date.parse(room.runtime.startedAt)
    : 0;
  const existing = readJson<Record<string, unknown>[]>(RESULTS) ?? [];
  existing.push({
    scenario,
    roomId: room.definition.id,
    status: room.runtime.status,
    durationMs,
    costUsd: room.runtime.usage.costUsd,
    maxCostUsd: room.definition.envelope.maxCostUsd,
    turns: room.runtime.usage.turns,
    rosterRevisions: room.runtime.usage.rosterRevisions,
    memberReplacements: room.runtime.usage.memberReplacements,
    stopReason: room.runtime.stopReason?.kind ?? null,
    delivered: room.delivery.deliveredAt !== null,
    deliveryRef: room.delivery.deliveryRef,
    roster: roster.map((member) => ({
      role: member.mandate.role,
      conductor: member.isConductor,
      model: member.configuration.model,
      thinking: member.configuration.thinking,
      costUsd: member.usage.costUsd,
    })),
    ...notes,
  });
  fs.writeFileSync(RESULTS, JSON.stringify(existing, null, 2), 'utf8');
}

async function shot(name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
}

const panel = () => page.locator('[data-app="orchestrator"]').first();

async function openRooms(): Promise<void> {
  await page.evaluate(() => window.__appControl?.openApp('orchestrator'));
  await expect(panel()).toBeVisible({ timeout: 20_000 });
  // The tab can carry a Room count, so it is found by its title. Scoped to the
  // top navigation so the Room list's own heading cannot match it.
  await panel().locator('nav button[title="Rooms"]').click();
}

/**
 * Answers the host's request to allow agent sessions (AD-029).
 *
 * A Room opens no session until the user allows one, and silence is a refusal.
 * The evaluation answers it the way a user does — by pressing the button — so
 * the consent surface is exercised rather than turned off.
 */
async function allowAgentSessions(name: string, timeoutMs = 30_000): Promise<void> {
  // The card numbers its options, so the accessible name is "1. Allow" — a
  // substring match, never an exact one.
  const allow = page.getByRole('button', { name: 'Allow' }).first();
  await expect(allow, 'the host never asked to allow agent sessions').toBeVisible({ timeout: timeoutMs });
  await shot(`${name}-02b-approval.png`);
  // Somebody watching the run can press it first. The Room's own status is what
  // decides whether it started; this click only has to not be the reason it
  // did not.
  await allow.click({ timeout: 10_000 }).catch(() => undefined);
}

/**
 * Opens the Room brief the way a user does: the Room start action on the Home
 * tab. A narrow panel folds the start actions into its More actions menu.
 */
async function openRoomBrief(): Promise<void> {
  await panel().locator('nav button[title="Home"]').click();
  const action = panel().getByRole('button', { name: 'Room', exact: true });
  const more = panel().getByRole('button', { name: 'More actions' });
  // Both stay in the page and the width hides one, so wait for whichever shows.
  await expect(action.or(more).filter({ visible: true })).toBeVisible({ timeout: 10_000 });
  if (await action.isVisible()) {
    await action.click();
  } else {
    await more.click();
    await page.getByRole('menuitem', { name: 'Room', exact: true }).click();
  }
  await expect(panel().getByPlaceholder(/session-fixation/)).toBeVisible({ timeout: 10_000 });
}

/**
 * Drives the panel the way a user does: describe the problem, read the team
 * Sero proposes, start it, allow the sessions. Returns the Room id.
 */
async function startRoom(brief: string, name: string): Promise<string> {
  await openRooms();
  const before = new Set((roomIndex()?.rooms ?? []).map((room) => room.id));
  await openRoomBrief();
  await panel().getByPlaceholder(/session-fixation/).fill(brief);
  await shot(`${name}-01-brief.png`);
  await panel().getByRole('button', { name: 'Design the team' }).click();

  // The real planner runs here.
  await expect(panel().getByRole('button', { name: 'Start room' })).toBeVisible({ timeout: 300_000 });
  await shot(`${name}-02-proposal.png`);

  // The draft is written when the planner answers, so the Room can be watched
  // from the Start press rather than found afterwards.
  const roomId = (roomIndex()?.rooms ?? []).find((room) => !before.has(room.id))?.id;
  if (!roomId) throw new Error('the planner never wrote a draft Room');

  await panel().getByRole('button', { name: 'Start room' }).click();
  await allowAgentSessions(name);

  // A Room that was refused stays a draft. Failing here says so in seconds,
  // instead of looking like a Room that ran for 25 minutes and never finished.
  await expect
    .poll(() => roomFile(roomId)?.runtime.status ?? 'gone', { timeout: 120_000, intervals: [2_000] })
    .not.toBe('draft');
  return roomId;
}

/**
 * Starts a Room through the `rooms` tool's prepare and start actions, the ones
 * the panel calls. For a scenario about what happens after the start, not the
 * start form. A planner question is answered with "use your judgement".
 */
async function startRoomByTool(brief: string, name: string): Promise<string> {
  await openRooms();
  const call = (params: Record<string, unknown>) => page.evaluate(({ workspaceId, input }) =>
    window.sero.appAgent.invokeTool('orchestrator', workspaceId, 'rooms', input), { workspaceId: wsId, input: params });
  let prepared = await call({ action: 'prepare', problem: brief }) as { details?: { roomId?: string; questions?: { prompt: string }[] } };
  const questions = prepared.details?.questions ?? [];
  if (!prepared.details?.roomId && questions.length > 0) {
    const answers = questions.map((question) => ({ prompt: question.prompt, answer: 'Use your judgement and follow the brief.' }));
    prepared = await call({ action: 'prepare', problem: brief, clarificationsJson: JSON.stringify(answers) }) as typeof prepared;
  }
  const roomId = prepared.details?.roomId;
  if (!roomId) throw new Error(`prepare made no Room: ${JSON.stringify(prepared).slice(0, 400)}`);
  await shot(`${name}-02-proposal.png`);
  // Start waits for the host's session approval, so answer it while start runs.
  const started = call({ action: 'start', roomId });
  await allowAgentSessions(name);
  console.log(`[rooms] start: ${JSON.stringify(await started).slice(0, 300)}`);
  await expect
    .poll(() => roomFile(roomId)?.runtime.status ?? 'gone', { timeout: 120_000, intervals: [2_000] })
    .not.toBe('draft');
  return roomId;
}

/**
 * Waits for the Room to reach a terminal state, whichever one it is. With
 * `orPaused`, a Room that paused to wait for the user also ends the wait.
 */
async function settle(roomId: string, name: string, orPaused = false): Promise<RoomFile> {
  await expect
    .poll(() => roomFile(roomId)?.runtime.status ?? '', { timeout: SCENARIO_TIMEOUT_MS, intervals: [5_000] })
    .toMatch(orPaused ? /completed|failed|cancelled|paused/ : /completed|failed|cancelled/);
  await shot(`${name}-03-finished.png`);
  const room = roomFile(roomId);
  if (!room) throw new Error('the Room record vanished');
  return room;
}

// One app, one scenario at a time — but NOT serial: the gate needs all four
// answers from one run, and serial mode skips the rest as soon as one fails.
test.describe.configure({ mode: 'default' });
test.skip(gate.skip, gate.reason);
test.skip(!ENABLED, 'Set SERO_E2E_ROOMS=1 to run the Room evaluation. It spends real money.');

test.beforeAll(async () => {
  test.setTimeout(180_000);
  fs.mkdirSync(SHOTS, { recursive: true });

  const seroHome = REAL_HOME ? path.join(os.homedir(), '.sero-ui') : (() => {
    home = createTempSeroHome();
    // The app opens a seeded profile only under its fixed root, and a temp home
    // has no git identity for the members' commits.
    const profile = seedWorkflowProfile(home, { profilePath: path.join(home.path, '.sero-ui', 'profiles', 'workflow-test') });
    // A fresh profile has no model for any tier, and the planner refuses without one.
    const llm = getLlmLaunchEnv();
    if (llm.SERO_E2E_LLM_PROVIDER && llm.SERO_E2E_LLM_MODEL) {
      const tier = { provider: llm.SERO_E2E_LLM_PROVIDER, modelId: llm.SERO_E2E_LLM_MODEL, thinkingLevel: process.env.SERO_ROOM_THINKING ?? 'low' };
      fs.writeFileSync(path.join(profile.path, 'agent', 'settings.json'), `${JSON.stringify({ sero: { modelTiers: { LOW: tier, MED: tier, HIGH: tier } } }, null, 2)}\n`);
    }
    homeEnv = {
      HOME: home.path,
      USERPROFILE: home.path,
      SERO_FIXED_ROOT_OVERRIDE: path.join(home.path, '.sero-ui'),
      GIT_AUTHOR_NAME: 'Sero E2E', GIT_AUTHOR_EMAIL: 'e2e@sero.test',
      GIT_COMMITTER_NAME: 'Sero E2E', GIT_COMMITTER_EMAIL: 'e2e@sero.test',
    };
    return profile.path;
  })();

  // A real git workspace: worktrees and claims are half the gate, and neither
  // exists outside a repository.
  const wsRoot = REAL_HOME ? path.join(seroHome, 'workspaces') : path.join(seroHome, 'e2e-workspaces');
  wsDir = createWorkspaceDir(wsRoot, `agent-rooms-e2e-${Date.now()}`, {
    'README.md': '# Agent Rooms evaluation workspace\n',
    'src/greet.ts': 'export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n',
    'src/money.ts': 'export const CURRENCY = "GBP";\n',
    '.gitignore': 'node_modules\n',
  });
  const git = (...args: string[]) => execFileSync('git', args, { cwd: wsDir, stdio: 'ignore' });
  git('init', '-b', 'main');
  // Orchestrator state churns constantly; a Room that audits git status would
  // otherwise trip on its own records.
  fs.mkdirSync(path.join(wsDir, '.git', 'info'), { recursive: true });
  fs.writeFileSync(path.join(wsDir, '.git', 'info', 'exclude'), '.sero/\n', 'utf8');
  git('add', '-A');
  git('-c', 'user.email=e2e@sero.test', '-c', 'user.name=Sero E2E', 'commit', '-m', 'initial');

  stateDir = path.join(wsDir, '.sero', 'apps', 'orchestrator');
  seroHomePath = seroHome;
  await launchApp();

  const created = await page.evaluate(async ({ folderPath }) => {
    const workspace = await window.sero.workspace.addFolder(folderPath, 'Agent Rooms e2e');
    window.dispatchEvent(new Event('sero:workspace-changed'));
    return workspace;
  }, { folderPath: wsDir });
  wsId = created.id;
  // With a real home the shell restores the user's own layout, and a collapsed
  // sidebar hides the workspace tree entirely — the gate then fails on a
  // missing node rather than on anything it is meant to measure.
  const node = page.locator(workspaceSel.nodeById(wsId));
  if (!(await node.isVisible())) await page.locator(layoutSel.sidebarToggle).click();
  await node.click();
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

test.describe('the Room evaluation gate', () => {
  test('1 — a team built for the problem delivers the fix', async () => {
    test.skip(ONLY !== 'all' && ONLY !== '1', 'not the selected scenario');
    test.setTimeout(SCENARIO_TIMEOUT_MS + 120_000);

    // The one scenario that starts through the form. The rest start through the
    // tool the form calls, so a change to the form fails here and only here.
    const roomId = await startRoom(BRIEFS.delivery, 'delivery');
    const roster = members(roomId);
    // Staffed for THIS problem: a Conductor plus specialists, not a fixed cast.
    expect(roster.length).toBeGreaterThanOrEqual(2);
    expect(roster.filter((member) => member.isConductor)).toHaveLength(1);

    const room = await settle(roomId, 'delivery');
    const greet = roomCopiesOf(roomId, 'src/greet.ts');
    const tests = roomCopiesOf(roomId, /greet[^/]*\.test\.[cm]?[jt]sx?$/);
    record('1-delivery', room, members(roomId), {
      workItems: room.work.length,
      artifacts: room.artifacts.length,
      greetFiles: greet,
      testFiles: tests,
    });

    expect(room.runtime.status).toBe('completed');
    expect(room.delivery.deliveredAt).not.toBeNull();
    expect(room.runtime.usage.costUsd).toBeLessThanOrEqual(room.definition.envelope.maxCostUsd);
    // A valid fix can keep the normal-name return unchanged, so assert the
    // required empty-name behavior and its regression test instead.
    expect(greet.some((copy) => copy.content.toLowerCase().includes('world'))).toBe(true);
    expect(tests.some((copy) => /greet\((?:''|"")\)/.test(copy.content) && /world/i.test(copy.content))).toBe(true);
  });

  test('2 — an adversarial brief staffs both sides of the argument', async () => {
    test.skip(ONLY !== 'all' && ONLY !== '2', 'not the selected scenario');
    test.setTimeout(SCENARIO_TIMEOUT_MS + 120_000);

    const roomId = await startRoomByTool(BRIEFS.adversarial, 'adversarial');
    const room = await settle(roomId, 'adversarial');
    const roster = members(roomId);
    const decision = roomCopiesOf(roomId, 'DECISION.md');
    record('2-adversarial', room, roster, {
      artifacts: room.artifacts.length,
      decision: decision.map((copy) => copy.root),
    });

    expect(room.runtime.status).toBe('completed');
    // Two people cannot argue if there is only one of them: the roster itself
    // is what makes the analysis adversarial, not a prompt telling one member
    // to disagree with itself.
    expect(roster.length).toBeGreaterThanOrEqual(3);
    expect(decision.length).toBeGreaterThan(0);
  });

  test('3 — parallel work gets a checkout each, and overlaps are claimed', async () => {
    test.skip(ONLY !== 'all' && ONLY !== '3', 'not the selected scenario');
    test.setTimeout(SCENARIO_TIMEOUT_MS + 120_000);

    const roomId = await startRoomByTool(BRIEFS.parallel, 'parallel');
    const room = await settle(roomId, 'parallel');
    const roster = members(roomId);
    // A finished Room has released its checkouts and kept their branches.
    const worktrees = roster.filter((member) => member.worktreeBranch !== null);
    record('3-parallel', room, roster, {
      worktrees: worktrees.map((member) => member.worktreeBranch),
      claims: room.claims.map((claim) => `${claim.memberId}:${claim.pattern}`),
    });

    expect(room.runtime.status).toBe('completed');
    // Separate checkouts are the real safety boundary; claims are the warning
    // that two people are heading for the same file.
    expect(worktrees.length).toBeGreaterThanOrEqual(2);
    expect(new Set(worktrees.map((member) => member.worktreeBranch)).size).toBe(worktrees.length);
    expect(room.claims.length).toBeGreaterThan(0);
  });

  test('4 — a Room asked for in a chat answers that chat', async () => {
    test.skip(ONLY !== 'all' && ONLY !== '4', 'not the selected scenario');
    test.setTimeout(SCENARIO_TIMEOUT_MS + 120_000);

    const { session } = await createOpenAgentSession(page, wsDir, 'Agent Rooms e2e');
    const before = new Set((roomIndex()?.rooms ?? []).map((room) => room.id));

    // The chat asks for a Room in the user's own words. The `rooms` tool is
    // what turns that into a drafted Room; nothing runs until it is started.
    const asked = promptAndCollectEvents(
      page,
      session.id,
      'Use the rooms tool to prepare a Room that documents what src/greet.ts does, in README.md. '
      + 'Then start it and tell me the Room id.',
      600_000,
    );
    // The Room the chat starts needs the same approval as one started by hand,
    // and the chat is still running while it is asked.
    await allowAgentSessions('chat', 300_000);
    await asked;

    // The Room the chat STARTED, not the first one it drafted: a chat may draft
    // more than one before it starts the one it wants, and an abandoned draft
    // never settles.
    const fresh = (roomIndex()?.rooms ?? []).filter((room) => !before.has(room.id));
    const roomId = (fresh.find((room) => room.status !== 'draft') ?? fresh.at(-1))?.id;
    expect(roomId, 'the chat never created a Room').toBeTruthy();
    if (!roomId) return;

    // The contract the old engines had, and the one Rooms must keep: the Room
    // knows which chat asked, and the answer goes back there.
    expect(roomFile(roomId)?.delivery.originSessionId).toBe(session.id);

    const room = await settle(roomId, 'chat');
    record('4-chat-origin', room, members(roomId), { sessionId: session.id });
    expect(room.runtime.status).toBe('completed');
    expect(room.delivery.deliveryRef).toBe(`session:${session.id}`);
  });
  test('5 — a Room changes its team across a restart and keeps every history', async () => {
    test.skip(ONLY !== 'all' && ONLY !== '5', 'not the selected scenario');
    test.setTimeout(SCENARIO_TIMEOUT_MS + 300_000);

    const roomId = await startRoomByTool(BRIEFS.amend, 'amend');
    const grantBefore = roomGrant(roomId);
    // Wait for the Room to ask for a team or setup change, or to end without one.
    await expect
      .poll(() => (amendments(roomId).length > 0 ? 'amending' : /completed|failed|cancelled/.test(roomFile(roomId)?.runtime.status ?? '') ? 'ended' : ''), { timeout: SCENARIO_TIMEOUT_MS, intervals: [3_000] })
      .toMatch(/amending|ended/);
    const asked = amendments(roomId);
    const histories = sessionHistories(roomId);
    await shot('amend-02c-change-asked.png');

    let restarted = false;
    // Read straight after the restart: a Room that ends releases its grant.
    let grantAfterRestart: string | null = grantBefore;
    let historiesAfterRestart = histories;
    if (asked.length > 0) {
      // Sero stops while the change is in flight, the way a user quits.
      await closeSeroApp(app, 15_000);
      await launchApp();
      restarted = true;
      await openRooms();
      // A replacement member opens a session after the restart; answer the host if it asks.
      await allowAgentSessions('amend-after-restart', 60_000).catch(() => undefined);
      await expect
        .poll(() => amendments(roomId).every((change) => change.state !== 'pending') ? 'settled' : 'pending', { timeout: 600_000, intervals: [5_000] })
        .toBe('settled');
      grantAfterRestart = roomGrant(roomId);
      historiesAfterRestart = sessionHistories(roomId);
    }
    const after = amendments(roomId);
    const held = after.filter((change) => change.state === 'held');
    await shot('amend-02d-after-restart.png');

    // A held change waits for the user; this run approves it, as a user would.
    // Approving asks the host, which shows the same Allow card as a start.
    const approvals: { id: string; outcome: unknown }[] = [];
    for (const change of held) {
      const approving = approveHeld(roomId, change.id);
      await allowAgentSessions('amend-approve', 60_000).catch(() => undefined);
      const outcome = await approving;
      approvals.push({ id: change.id, outcome });
      console.log(`[rooms] approving held change ${change.id}: ${JSON.stringify(outcome)}`);
    }

    // A declined change leaves the Room waiting for the user, which is an answer too.
    const room = await settle(roomId, 'amend', true);
    const kept = Object.entries(histories).map(([memberId, before]) => ({
      memberId,
      samePath: historiesAfterRestart[memberId]?.sessionPath === before.sessionPath,
      linesBefore: before.lines,
      linesAfter: historiesAfterRestart[memberId]?.lines ?? 0,
    }));
    record('5-amend-restart', room, members(roomId), {
      restarted,
      grantBefore,
      grantAfterRestart,
      grantAtEnd: roomGrant(roomId),
      amendmentsAsked: asked.map(({ id, state, adds }) => ({ id, state, adds })),
      amendmentsAfterRestart: after.map(({ id, state, adds, reason, grantRevision }) => ({ id, state, adds, reason, grantRevision })),
      approvals,
      amendmentsAtEnd: amendments(roomId).map(({ id, state }) => ({ id, state })),
      historiesKept: kept,
    });
    if (asked.length === 0) {
      console.log('[rooms] the Room never asked for a team or setup change, so no amendment was replayed');
      return;
    }
    // The amendment kept the one grant, and no member lost its session or its history.
    expect(grantAfterRestart).toBe(grantBefore);
    for (const entry of kept) {
      expect(entry.linesBefore, `member ${entry.memberId} had a history to keep`).toBeGreaterThan(0);
      expect(entry.samePath, `member ${entry.memberId} kept its session file`).toBe(true);
      expect(entry.linesAfter, `member ${entry.memberId} kept its history`).toBeGreaterThanOrEqual(entry.linesBefore);
    }
    expect(after.every((change) => change.state !== 'pending')).toBe(true);
  });

  test('6 — a change inside the approval applies with no question', async () => {
    test.skip(ONLY !== 'all' && ONLY !== '6', 'not the selected scenario');
    test.setTimeout(SCENARIO_TIMEOUT_MS + 120_000);

    const roomId = await startRoomByTool(BRIEFS.narrow, 'narrow');
    const grantBefore = roomGrant(roomId);
    // Wait for the Room's change to settle, or for the Room to end without one.
    await expect
      .poll(() => {
        const asked = amendments(roomId);
        if (asked.length > 0 && asked.every((change) => change.state !== 'pending')) return 'settled';
        return /completed|failed|cancelled|paused/.test(roomFile(roomId)?.runtime.status ?? '') ? 'ended' : '';
      }, { timeout: SCENARIO_TIMEOUT_MS, intervals: [3_000] })
      .toMatch(/settled|ended/);
    // Read before the Room ends: a finished Room releases its grant.
    const grantAtChange = roomGrant(roomId);
    const asked = amendments(roomId);
    const historiesAtChange = sessionHistories(roomId);
    const reviewerAtChange = members(roomId).find((member) => member.id === 'reviewer');
    await shot('narrow-02-change.png');

    const room = await settle(roomId, 'narrow', true);
    const roster = members(roomId);
    const historiesAtEnd = sessionHistories(roomId);
    record('6-narrow-in-policy', room, roster, {
      grantBefore,
      grantAtChange,
      amendments: asked.map(({ id, state, adds, reason, grantRevision }) => ({ id, state, adds, reason, grantRevision })),
      reviewerToolsAtChange: reviewerAtChange?.configuration.tools ?? null,
      historiesAtChange,
      historiesAtEnd,
    });
    expect(asked.length, 'the Conductor proposed the change').toBeGreaterThan(0);
    // Taking a tool away adds no authority, so the host applied it without asking the user.
    for (const change of asked) {
      expect(change.state, `change ${change.id}: ${change.reason ?? ''}`).toBe('applied');
      expect(change.adds).toEqual([]);
    }
    expect(grantAtChange).toBe(grantBefore);
    expect(reviewerAtChange?.configuration.tools).not.toContain('write');
    // The reviewer's session was reopened on the same history, not started again.
    expect(historiesAtChange.reviewer?.lines ?? 0).toBeGreaterThan(0);
    expect(historiesAtEnd.reviewer?.sessionPath).toBe(historiesAtChange.reviewer?.sessionPath);
    expect(historiesAtEnd.reviewer?.lines ?? 0).toBeGreaterThanOrEqual(historiesAtChange.reviewer?.lines ?? 0);
  });
});
