/**
 * Sero Architect on the built Electron main: intake through the first owner
 * wake, and the maintenance triage loop.
 *
 * Scenario 1 (intake and the first wake) needs a model and spends a few cents:
 *
 *   env -u ELECTRON_RUN_AS_NODE SERO_E2E_ARCHITECT=1 SERO_E2E_LLM_MODE=cheap \
 *     SERO_E2E_LLM_PROVIDER=anthropic \
 *     npx playwright test e2e/architect.agent.spec.ts --project=agent
 *
 * Scenario 2 (maintenance triage) also files a real GitHub issue in the private
 * scratch repo the GitHub live spec uses, so it is double-gated on
 * SERO_E2E_GH_LIVE=1 and a working `gh auth status`.
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
  type TempSeroHome,
} from './helpers';
import { seedWorkflowProfile, waitForShell } from './helpers/workflow';

const ENABLED = process.env.SERO_E2E_ARCHITECT === '1';
const GH_LIVE = process.env.SERO_E2E_GH_LIVE === '1';
const REPO_NAME = 'sero-e2e-github-live';
const SHOTS = path.resolve(__dirname, 'screenshots', 'architect');
const gate = requireLlmReady();

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

interface ProjectFile {
  id: string;
  phase: string;
  overlay: string | null;
  blockedReason: string | null;
  workspaceId: string | null;
  folder: string;
  brief: string | null;
  stateLine: string;
  decisions: { id: string; question: string; recommendation: string }[];
  milestones: { id: string; status: string; dispatch: { kind: string; id: string } | null }[];
  research: { id: string }[];
  budget: { spentUsd: number };
  session: { grantId: string | null; sessionPath: string | null; turns: number; silentTurns: number };
}

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

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;
let mainLog = '';
let projectId = '';

const projectFile = (): ProjectFile | null => {
  const dir = architectDir(home.path);
  return dir ? readJson<ProjectFile>(path.join(dir, 'projects', `${projectId}.json`)) : null;
};

async function shot(name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
}

/** Runs a management action inside Electron main, where the runtime registry lives. */
async function projects<T>(action: string, ...args: unknown[]): Promise<T> {
  return app.evaluate(async (_electron, { action: name, args: input }) => {
    const entry = (globalThis as Record<string, unknown>)['sero-architect:runtime'] as { entry: { projects: Record<string, (...a: unknown[]) => Promise<unknown>> } | null } | undefined;
    if (!entry?.entry) throw new Error('the Architect runtime is not registered');
    const fn = entry.entry.projects[name];
    if (typeof fn !== 'function') throw new Error(`no projects action ${name}; have ${Object.keys(entry.entry.projects).join(', ')}`);
    return (await fn.apply(entry.entry.projects, input)) as T;
  }, { action, args });
}

/** Presses Allow on the persistent-session grant card, the way a user does. */
async function allowOwnerSession(name: string): Promise<void> {
  const allow = page.getByRole('button', { name: 'Allow' }).first();
  await expect(allow, 'the host never asked to allow the owner session').toBeVisible({ timeout: 60_000 });
  await shot(`${name}-grant.png`);
  await allow.click({ timeout: 10_000 }).catch(() => undefined);
}

test.describe.configure({ mode: 'serial' });
test.skip(gate.skip, gate.reason);
test.skip(!ENABLED, 'Set SERO_E2E_ARCHITECT=1 to run the Architect e2e. It spends real money.');

test.beforeAll(async () => {
  test.setTimeout(180_000);
  fs.mkdirSync(SHOTS, { recursive: true });
  home = createTempSeroHome();
  seedWorkflowProfile(home);
  const llm = getLlmLaunchEnv();
  ({ app, page } = await launchSeroApp({
    seroHome: home.path,
    runtime: 'host',
    env: {
      // Point the app at the seeded profile. HOME stays real so the project folder and git credentials do.
      SERO_FIXED_ROOT_OVERRIDE: path.join(home.path, '.sero-ui'),
      ...llm,
      // Pin the owner to the cheap e2e model rather than the first reasoning model on the machine.
      ...(llm.SERO_E2E_LLM_PROVIDER && llm.SERO_E2E_LLM_MODEL ? { SERO_ARCHITECT_MODEL: `${llm.SERO_E2E_LLM_PROVIDER}/${llm.SERO_E2E_LLM_MODEL}` } : {}),
    },
  }));
  const appLog = fs.createWriteStream(path.join(SHOTS, 'app.log'), { flags: 'a' });
  for (const stream of [app.process().stdout, app.process().stderr]) {
    stream?.on('data', (chunk: Buffer) => { mainLog += chunk.toString(); });
    stream?.pipe(appLog);
  }
  await waitForShell(page);
});

/** Workspaces must sit under the real home directory, so the project folder lives there and is removed after. */
const PROJECTS_ROOT = path.join(os.homedir(), '.sero-e2e-architect');

test.afterAll(async () => {
  try {
    await closeSeroApp(app);
  } finally {
    home.cleanup();
    fs.rmSync(PROJECTS_ROOT, { recursive: true, force: true });
  }
});

test('intake creates the workspace, the grant is approved, and the owner receives the contract on its first turn', async () => {
  test.setTimeout(420_000);
  const folder = path.join(PROJECTS_ROOT, `hollow-depths-${Date.now()}`);
  const idea = 'A small roguelike: a hex grid, one player, three enemy types, permadeath. Build it as a web app.';

  // create() waits for the grant answer, so the call and the click overlap.
  const creating = projects<{ ok: boolean; text: string; projectId?: string }>('create', { idea, folder });
  await allowOwnerSession('01');
  const outcome = await creating;
  expect(outcome.ok, outcome.text).toBe(true);
  projectId = outcome.projectId ?? '';
  expect(projectId).not.toBe('');

  // The workspace exists and was created seconds ago, and the project moved on from intake.
  const record = projectFile();
  expect(record).not.toBeNull();
  expect(record?.phase).toBe('discovery');
  expect(record?.workspaceId).not.toBeNull();
  expect(fs.existsSync(path.join(record?.folder ?? '', '.git'))).toBe(true);
  expect(record?.session.grantId).not.toBeNull();
  await shot('02-discovery.png');

  // The first wake opens the session against that workspace and sends the contract first.
  await expect
    .poll(() => projectFile()?.session.sessionPath ?? null, { timeout: 120_000, intervals: [2_000] })
    .not.toBeNull();
  const sessionPath = projectFile()?.session.sessionPath ?? '';
  await expect
    .poll(() => fs.existsSync(sessionPath) ? fs.readFileSync(sessionPath, 'utf8') : '', { timeout: 60_000, intervals: [2_000] })
    .toContain('replaces every earlier Architect contract');
  const transcript = fs.readFileSync(sessionPath, 'utf8');
  const firstUserTurn = transcript.split('\n').find((line) => line.includes('"role":"user"')) ?? '';
  expect(firstUserTurn).toContain('replaces every earlier Architect contract');
  expect(transcript).toContain('<idea>');

  // The session's command surface: the Architect owner command and nothing from another app. The
  // private registry bridges only the grant-owning app, so the shared workspace commands are absent.
  await expect
    .poll(() => /\[persistent-sessions\] owner commands: ([^\n]*)/.exec(mainLog)?.[1] ?? null, { timeout: 60_000, intervals: [1_000] })
    .not.toBeNull();
  const commands = (/\[persistent-sessions\] owner commands: ([^\n]*)/.exec(mainLog)?.[1] ?? '').split(' (from')[0]!.split(',').map((c) => c.trim());
  expect(commands).toContain('architect');
  for (const foreign of ['orchestrator', 'rooms', 'room', 'goal', 'goals', 'kanban', 'notes', 'todo']) {
    expect(commands).not.toContain(foreign);
  }

  // The turn ends and is accounted for.
  await expect
    .poll(() => projectFile()?.session.turns ?? 0, { timeout: 300_000, intervals: [5_000] })
    .toBeGreaterThanOrEqual(1);
  const after = projectFile();
  await shot('03-after-first-turn.png');
  fs.writeFileSync(path.join(SHOTS, 'first-turn.json'), JSON.stringify({
    phase: after?.phase,
    overlay: after?.overlay,
    stateLine: after?.stateLine,
    brief: after?.brief,
    research: after?.research.length,
    decisions: after?.decisions.length,
    silentTurns: after?.session.silentTurns,
    spentUsd: after?.budget.spentUsd,
    commands,
  }, null, 2));
  expect(after?.budget.spentUsd ?? 0).toBeGreaterThan(0);
});

test.describe('maintenance triage', () => {
  test.skip(!GH_LIVE || !ghReady(), 'set SERO_E2E_GH_LIVE=1 and log in with gh to run the triage scenario (creates real GitHub activity)');

  let repoSlug = '';
  let issueNumber = '';

  test.afterAll(() => {
    try {
      if (issueNumber) gh(['issue', 'close', issueNumber, '-R', repoSlug]);
    } catch { /* best effort */ }
  });

  test('a filed issue wakes the owner to triage, and it dispatches or raises a decision', async () => {
    test.setTimeout(900_000);
    const record = projectFile();
    expect(record?.folder).toBeTruthy();
    const folder = record?.folder ?? '';

    // Point the project's repo at the scratch repo so the GitHub source sees its issues.
    const login = gh(['api', 'user', '--jq', '.login']);
    repoSlug = `${login}/${REPO_NAME}`;
    try {
      gh(['repo', 'view', repoSlug, '--json', 'name']);
    } catch {
      gh(['repo', 'create', repoSlug, '--private', '--add-readme']);
    }
    execFileSync('git', ['remote', 'add', 'origin', `https://github.com/${repoSlug}.git`], { cwd: folder, stdio: 'ignore' });
    const stateDir = path.join(folder, '.sero', 'apps', 'orchestrator');
    fs.mkdirSync(path.join(stateDir, 'events'), { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'events', 'github.json'), JSON.stringify({ intervalMs: 60_000 }));

    // Skip ahead to maintain by editing the record file, then wake the owner with a directive.
    const dir = architectDir(home.path)!;
    const file = path.join(dir, 'projects', `${projectId}.json`);
    const current = readJson<Record<string, unknown>>(file)!;
    fs.writeFileSync(file, JSON.stringify({ ...current, phase: 'maintain', stateLine: 'Released. Maintaining.' }, null, 2));
    const directive = await projects<{ ok: boolean; text: string }>('directive', projectId, 'We are in maintenance now. Triage anything that arrives.');
    expect(directive.ok, directive.text).toBe(true);

    // The runtime subscribes the maintenance Workflow before the owner's turn.
    await expect
      .poll(() => projectFile()?.milestones.find((m) => m.id === 'maintenance')?.dispatch?.id ?? null, { timeout: 180_000, intervals: [3_000] })
      .not.toBeNull();
    const loopId = projectFile()?.milestones.find((m) => m.id === 'maintenance')?.dispatch?.id ?? '';
    const turnsBefore = projectFile()?.session.turns ?? 0;

    const issueUrl = gh(['issue', 'create', '-R', repoSlug, '--title', `Architect triage ${Date.now()}`, '--body', 'The player can walk through walls on the hex grid.']);
    issueNumber = issueUrl.split('/').pop()!;

    // The maintenance Workflow fires on the issue, completes its run, and that completion wakes the owner.
    const runsFile = path.join(stateDir, 'loops', loopId, 'runs', 'index.json');
    await expect
      .poll(() => readJson<{ runs: { firedBy?: { source: string } }[] }>(runsFile)?.runs.find((r) => r.firedBy?.source === 'github:issue-opened') ?? null, { timeout: 480_000, intervals: [5_000] })
      .not.toBeNull();
    await expect
      .poll(() => projectFile()?.session.turns ?? 0, { timeout: 300_000, intervals: [5_000] })
      .toBeGreaterThan(turnsBefore);
    const after = projectFile();
    await shot('04-triage.png');
    const dispatched = after?.milestones.some((m) => m.id !== 'maintenance' && m.dispatch !== null) ?? false;
    const decided = (after?.decisions.length ?? 0) > 0;
    expect(dispatched || decided, 'the owner neither dispatched a fix nor raised a decision').toBe(true);
  });
});
