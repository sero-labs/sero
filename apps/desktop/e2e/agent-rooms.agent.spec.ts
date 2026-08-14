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
 *   4  a Room asked for in a chat returns its result to that chat (FR-029).
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
  mandate: { role: string };
  configuration: { model: string; thinking: string };
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
  await panel().getByRole('button', { name: 'Rooms' }).click();
}

/**
 * Drives the panel the way a user does: describe the problem, read the team
 * Sero proposes, start it. Returns the Room id the runtime wrote.
 */
async function startRoom(brief: string, name: string): Promise<string> {
  await openRooms();
  const before = new Set((roomIndex()?.rooms ?? []).map((room) => room.id));
  await panel().getByRole('button', { name: /New room|Start a Room/ }).first().click();
  await panel().getByPlaceholder(/session-fixation/).fill(brief);
  await shot(`${name}-01-brief.png`);
  await panel().getByRole('button', { name: 'Design the team' }).click();

  // The real planner runs here.
  await expect(panel().getByRole('button', { name: 'Start room' })).toBeVisible({ timeout: 300_000 });
  await shot(`${name}-02-proposal.png`);

  await panel().getByRole('button', { name: 'Start room' }).click();
  await expect
    .poll(() => (roomIndex()?.rooms ?? []).find((room) => !before.has(room.id))?.id ?? null, { timeout: 60_000 })
    .not.toBeNull();
  const roomId = (roomIndex()?.rooms ?? []).find((room) => !before.has(room.id))?.id;
  if (!roomId) throw new Error('the Room was never written');
  return roomId;
}

/** Waits for the Room to reach a terminal state, whichever one it is. */
async function settle(roomId: string, name: string): Promise<RoomFile> {
  await expect
    .poll(() => roomFile(roomId)?.runtime.status ?? '', { timeout: SCENARIO_TIMEOUT_MS, intervals: [5_000] })
    .toMatch(/completed|failed|cancelled/);
  await shot(`${name}-03-finished.png`);
  const room = roomFile(roomId);
  if (!room) throw new Error('the Room record vanished');
  return room;
}

test.describe.configure({ mode: 'serial' });
test.skip(gate.skip, gate.reason);
test.skip(!ENABLED, 'Set SERO_E2E_ROOMS=1 to run the Room evaluation. It spends real money.');

test.beforeAll(async () => {
  test.setTimeout(180_000);
  fs.mkdirSync(SHOTS, { recursive: true });

  const seroHome = REAL_HOME ? path.join(os.homedir(), '.sero-ui') : (() => {
    home = createTempSeroHome();
    seedWorkflowProfile(home);
    return home.path;
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

  ({ app, page } = await launchSeroApp({
    seroHome,
    runtime: 'host',
    // The rollout gate. Without it the runtime refuses every Room action.
    env: { SERO_ROOMS: '1', ...(REAL_HOME ? {} : getLlmLaunchEnv()) },
  }));
  await waitForShell(page);

  const created = await page.evaluate(async ({ folderPath }) => {
    const workspace = await window.sero.workspace.addFolder(folderPath, 'Agent Rooms e2e');
    window.dispatchEvent(new Event('sero:workspace-changed'));
    return workspace;
  }, { folderPath: wsDir });
  wsId = created.id;
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

test.describe('the Room evaluation gate', () => {
  test('1 — a team built for the problem delivers the fix', async () => {
    test.skip(ONLY !== 'all' && ONLY !== '1', 'not the selected scenario');
    test.setTimeout(SCENARIO_TIMEOUT_MS + 120_000);

    const roomId = await startRoom(BRIEFS.delivery, 'delivery');
    const roster = members(roomId);
    // Staffed for THIS problem: a Conductor plus specialists, not a fixed cast.
    expect(roster.length).toBeGreaterThanOrEqual(2);
    expect(roster.filter((member) => member.isConductor)).toHaveLength(1);

    const room = await settle(roomId, 'delivery');
    record('1-delivery', room, members(roomId), {
      workItems: room.work.length,
      artifacts: room.artifacts.length,
      greetFile: fs.readFileSync(path.join(wsDir, 'src', 'greet.ts'), 'utf8'),
    });

    expect(room.runtime.status).toBe('completed');
    expect(room.delivery.deliveredAt).not.toBeNull();
    expect(room.runtime.usage.costUsd).toBeLessThanOrEqual(room.definition.envelope.maxCostUsd);
    // The point of the scenario: the workspace actually changed.
    expect(fs.readFileSync(path.join(wsDir, 'src', 'greet.ts'), 'utf8')).not.toContain('return `Hello, ${name}!`;\n}\n');
  });

  test('2 — an adversarial brief staffs both sides of the argument', async () => {
    test.skip(ONLY !== 'all' && ONLY !== '2', 'not the selected scenario');
    test.setTimeout(SCENARIO_TIMEOUT_MS + 120_000);

    const roomId = await startRoom(BRIEFS.adversarial, 'adversarial');
    const room = await settle(roomId, 'adversarial');
    const roster = members(roomId);
    record('2-adversarial', room, roster, {
      artifacts: room.artifacts.length,
      decision: fs.existsSync(path.join(wsDir, 'DECISION.md')),
    });

    expect(room.runtime.status).toBe('completed');
    // Two people cannot argue if there is only one of them: the roster itself
    // is what makes the analysis adversarial, not a prompt telling one member
    // to disagree with itself.
    expect(roster.length).toBeGreaterThanOrEqual(3);
    expect(fs.existsSync(path.join(wsDir, 'DECISION.md'))).toBe(true);
  });

  test('3 — parallel work gets a checkout each, and overlaps are claimed', async () => {
    test.skip(ONLY !== 'all' && ONLY !== '3', 'not the selected scenario');
    test.setTimeout(SCENARIO_TIMEOUT_MS + 120_000);

    const roomId = await startRoom(BRIEFS.parallel, 'parallel');
    const room = await settle(roomId, 'parallel');
    const roster = members(roomId);
    const worktrees = roster.filter((member) => member.worktreePath !== null);
    record('3-parallel', room, roster, {
      worktrees: worktrees.map((member) => member.worktreeBranch),
      claims: room.claims.map((claim) => `${claim.memberId}:${claim.pattern}`),
    });

    expect(room.runtime.status).toBe('completed');
    // Separate checkouts are the real safety boundary; claims are the warning
    // that two people are heading for the same file.
    expect(worktrees.length).toBeGreaterThanOrEqual(2);
    expect(new Set(worktrees.map((member) => member.worktreePath)).size).toBe(worktrees.length);
    expect(room.claims.length).toBeGreaterThan(0);
  });

  test('4 — a Room asked for in a chat answers that chat', async () => {
    test.skip(ONLY !== 'all' && ONLY !== '4', 'not the selected scenario');
    test.setTimeout(SCENARIO_TIMEOUT_MS + 120_000);

    const { session } = await createOpenAgentSession(page, wsDir, 'Agent Rooms e2e');
    const before = new Set((roomIndex()?.rooms ?? []).map((room) => room.id));

    // The chat asks for a Room in the user's own words. The `rooms` tool is
    // what turns that into a drafted Room; nothing runs until it is started.
    await promptAndCollectEvents(
      page,
      session.id,
      'Use the rooms tool to prepare a Room that documents what src/greet.ts does, in README.md. '
      + 'Then start it and tell me the Room id.',
      600_000,
    );

    const roomId = (roomIndex()?.rooms ?? []).find((room) => !before.has(room.id))?.id;
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
});
