/**
 * Every tool and command a session is shown, it can call (spec
 * `session-tool-surface`).
 *
 * A local stub model, wired in as a custom provider, reads what a session sent
 * it, calls each tool and each listed Sero CLI command once, and reports what
 * came back. No API key and no spend. The spec also records each session's
 * start-up size, which the change measures against.
 *
 * Runs on the host runtime by default. `SERO_E2E_RUNTIME=apple-container` (or
 * `docker` on Linux) runs the same checks on a container workspace.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  DEFECT_KINDS,
  PROBE_EDIT_FILE,
  PROBE_FILE,
  SUBAGENT_TASK,
  closeSeroApp,
  createTempSeroHome,
  currentRuntimeFromEnv,
  launchSeroApp,
  layout as layoutSel,
  workspace as workspaceSel,
  seedStubProvider,
  startProbeStub,
  STUB_MODEL_ID,
  STUB_PROVIDER_ID,
  type ProbeStub,
  type StubReply,
  type StubRequest,
  type ProbedSession,
  type TempSeroHome,
} from './helpers';
import { promptAndCollectEvents } from './helpers/agent';
import { seedWorkflowProfile, waitForShell } from './helpers/workflow';

const RUNTIME = currentRuntimeFromEnv() ?? 'host';
// Outside the repository, because Playwright and the e2e global setup empty their own folders at the start of every run.
const SIZES_FILE = process.env.SERO_SESSION_TOOLS_SIZES ?? path.join(os.tmpdir(), 'sero-session-tools-sizes.json');

const CHAT_TOOLS = ['read', 'write', 'edit', 'bash', 'find', 'grep', 'multi_grep', 'run_code', 'subagent', 'sero-cli'];
/** No `subagent`, because a subagent cannot start another. A container runtime also gives it `automation_browser`. */
const SUBAGENT_TOOLS = ['read', 'write', 'edit', 'bash', 'find', 'grep', 'multi_grep', 'run_code', 'sero-cli'];
const GOAL_AND_ROOMS = ['goal', 'goals', 'goal_complete', 'goal_blocked', 'goal_wait', 'room', 'rooms'];
const MOVED_COMMANDS = ['mcp_manager', 'design_library_assets', 'design_library_settings'];

const CRON_JOB = 'probe-cron';
const CRON_PROMPT = 'probe-cron-prompt';
const CRON_SETUP = 'probe-cron-setup';
const ARCHITECT_CONTRACT = 'replaces every earlier Architect contract';

const LIVE_SETUP = 'probe-live';
const ROOM_BRIEF = 'probe-room-brief';
const ROOM_MANDATE = 'probe-room-mandate';

/** A canned Room planner reply: one Conductor that can read, write, edit and run commands. */
function planRoom(request: StubRequest): StubReply | undefined {
  if (!request.system.includes('You are the ROOM PLANNER')) return undefined;
  const task = request.messages.find((message) => message.role === 'user')?.text ?? '';
  const thinking = /AVAILABLE THINKING LEVELS[^\n]*\n([^\n,]+)/.exec(task)?.[1]?.trim() ?? 'off';
  return {
    text: JSON.stringify({
      title: 'Probe room',
      approach: 'One Conductor does the whole probe.',
      objective: 'Show what a Room member is given.',
      successCriteria: ['The member starts.'],
      roomInstructions: 'Stay in your working copy.',
      collaborationStrategy: 'There is one member.',
      teamRationale: 'A single member is enough to inspect what a member gets.',
      workspacePolicy: { mode: 'worktree-per-member' },
      estimatedDurationMs: 60_000,
      estimatedCostUsd: 0.01,
      openAssumptions: [],
      members: [{
        key: 'conductor',
        displayName: 'Probe Conductor',
        role: 'Conductor',
        responsibility: 'Runs the probe.',
        mandate: `${ROOM_MANDATE}. Do what the probe asks. Do not touch other files.`,
        reasonForInclusion: 'Without it there is no member to inspect.',
        isConductor: true,
        model: `${STUB_PROVIDER_ID}/${STUB_MODEL_ID}`,
        thinking,
        promptAdditions: [],
        // `automation_browser` is a runtime tool, so only a container workspace can give it.
        tools: ['read', 'write', 'edit', 'bash', 'web_search', ...(RUNTIME === 'host' ? [] : ['automation_browser'])],
        skills: [],
        permissions: 'edit-workspace',
        needsWorktree: true,
      }],
    }),
  };
}

let mainLog = '';
let home: TempSeroHome;
let stub: ProbeStub;
let app: ElectronApplication;
let page: Page;
let workspaceId: string;
let workspaceDir: string;
let chatSessionId = '';

/** What went wrong in one session, named, or an empty list. */
function defects(session: ProbedSession): string[] {
  return session.outcomes
    .filter((outcome) => DEFECT_KINDS.includes(outcome.kind))
    .map((outcome) => `${outcome.label} (${outcome.kind}): ${outcome.detail}`);
}

/** One place tells the session where the Pi docs are: the runtime block's line, or Pi's own section when there is no runtime block. */
function expectOnePiDocsPointer(session: ProbedSession): void {
  const pointers = (session.system.match(/Pi docs:/g)?.length ?? 0) + (session.system.match(/Pi documentation \(read only when/g)?.length ?? 0);
  expect(pointers).toBe(1);
}

function recordSize(kind: string, session: ProbedSession): void {
  const existing = fs.existsSync(SIZES_FILE)
    ? JSON.parse(fs.readFileSync(SIZES_FILE, 'utf8')) as Record<string, unknown>[]
    : [];
  const rest = existing.filter((row) => !(row.kind === kind && row.runtime === RUNTIME));
  rest.push({
    kind,
    runtime: RUNTIME,
    systemChars: session.system.length,
    toolSchemaChars: session.toolSchemaChars,
    totalChars: session.system.length + session.toolSchemaChars,
    tools: session.tools,
    commands: session.commands.length,
  });
  fs.mkdirSync(path.dirname(SIZES_FILE), { recursive: true });
  fs.writeFileSync(SIZES_FILE, JSON.stringify(rest, null, 2));
}

async function openProbeChat(prompt: string): Promise<string> {
  const sessionId = await page.evaluate(async ({ id, provider, model }) => {
    const created = await window.sero.sessions.create(id);
    await window.sero.agent.open(created.id, created.path, id);
    await window.sero.agent.setModel(created.id, provider, model);
    return created.id;
  }, { id: workspaceId, provider: STUB_PROVIDER_ID, model: STUB_MODEL_ID });
  await promptAndCollectEvents(page, sessionId, prompt, 120_000);
  return sessionId;
}

test.beforeAll(async () => {
  stub = await startProbeStub({
    // A chat that only sets up a cron job. The job's own session is the one probed.
    // The moved tools, run for real. Calls that depend on each other share one call, because parallel calls have no order.
    [LIVE_SETUP]: [
      { tool: 'sero-cli', arguments: { command: 'mcp_manager --action status' } },
      { tool: 'sero-cli', arguments: { command: ['design_library_settings --action read', `design_library_settings --action set-view --view '{"query":"probe-live"}'`].join('\n') } },
      { tool: 'sero-cli', arguments: { command: 'design_library_assets --action abort --uploadId missing-upload' } },
      // The hidden browser is a runtime tool, so only a container workspace has one.
      ...(RUNTIME === 'host' ? [] : [{ tool: 'sero-cli', arguments: { command: ['automation_browser --action launch', 'automation_browser --action close'].join('\n') } }]),
    ],
    // One call with two lines, which run in order. Two parallel calls could run before the job exists.
    [CRON_SETUP]: [
      { tool: 'sero-cli', arguments: { command: [
        `cron --action add --name ${CRON_JOB} --schedule "0 0 1 1 *" --prompt ${CRON_PROMPT} --model ${STUB_PROVIDER_ID}/${STUB_MODEL_ID}`,
        `cron --action run --name ${CRON_JOB}`,
      ].join('\n') } },
    ],
  }, planRoom);
  home = createTempSeroHome();
  // Outside the repository, so its own AGENTS.md and project skills stay out of the prompt.
  workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-session-tools-'));
  fs.writeFileSync(path.join(workspaceDir, PROBE_FILE), 'probe\n');
  fs.writeFileSync(path.join(workspaceDir, PROBE_EDIT_FILE), 'alpha\n');
  // A Room gives each member a worktree, which needs a repository.
  fs.writeFileSync(path.join(workspaceDir, '.gitignore'), '.sero/\n');
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=probe@example.com', '-c', 'user.name=Probe', ...args], { cwd: workspaceDir, stdio: 'ignore' });
  git('init', '-b', 'main');
  git('add', '-A');
  git('commit', '-m', 'initial');
  // An onboarded profile, so the shell opens and the Architect's Allow card can show.
  // The profile sits where the app keeps managed profiles, or the app moves it and the seeds are lost.
  const profile = seedWorkflowProfile(home, { profilePath: path.join(home.path, '.sero-ui', 'profiles', 'workflow-test') });
  ({ app, page } = await launchSeroApp({
    seroHome: profile.path,
    runtime: RUNTIME,
    env: {
      HOME: home.path,
      USERPROFILE: home.path,
      SERO_FIXED_ROOT_OVERRIDE: path.join(home.path, '.sero-ui'),
      // The temp HOME has no git identity, and the Architect commits in the project it creates.
      GIT_AUTHOR_NAME: 'Probe',
      GIT_AUTHOR_EMAIL: 'probe@example.com',
      GIT_COMMITTER_NAME: 'Probe',
      GIT_COMMITTER_EMAIL: 'probe@example.com',
      // The Architect owner session is a member session. Pin it to the stub.
      SERO_ARCHITECT_MODEL: `${STUB_PROVIDER_ID}/${STUB_MODEL_ID}`,
      // The Room planner and its members run on the stub too.
      SERO_ROOM_MODELS: `${STUB_PROVIDER_ID}/${STUB_MODEL_ID}`,
    },
    seed: (seroHome) => {
      seedStubProvider(seroHome, stub.server.baseUrl);
      // The Room planner and members take their model from the tiers. Point every tier at the stub.
      const stubTier = { provider: STUB_PROVIDER_ID, modelId: STUB_MODEL_ID };
      fs.writeFileSync(
        path.join(seroHome, 'agent', 'settings.json'),
        JSON.stringify({ sero: { modelTiers: { LOW: stubTier, MED: stubTier, HIGH: stubTier } } }, null, 2),
      );
      // A profile whose memory is set up, so the prompt is what a used profile sends.
      const memoryRoot = path.join(seroHome, 'workspaces', 'global');
      fs.mkdirSync(memoryRoot, { recursive: true });
      fs.writeFileSync(path.join(memoryRoot, 'IDENTITY.md'), '# Identity\n\n- **Name:** Sero\n');
      fs.writeFileSync(path.join(memoryRoot, 'USER.md'), '# User\n\n- **Role:** Developer\n');
    },
  }));
  for (const stream of [app.process().stdout, app.process().stderr]) stream?.on('data', (chunk: Buffer) => { mainLog += chunk.toString(); });
  await waitForShell(page);
  const workspace = await page.evaluate(
    ({ folder }) => window.sero.workspace.addFolder(folder, 'Session Tools'),
    { folder: workspaceDir },
  );
  workspaceId = workspace.id;
  if (RUNTIME !== 'host') {
    await page.evaluate(({ id, runtime }) => window.sero.workspace.setRuntimeBackend(id, runtime), { id: workspaceId, runtime: RUNTIME });
  }
});

test.afterAll(async () => {
  // Setup can fail before any of these exist. Each step runs whatever the ones before it did.
  try {
    if (app) await closeSeroApp(app);
  } finally {
    try {
      await stub?.server.close();
    } finally {
      home?.cleanup();
      if (workspaceDir) fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  }
});

test.describe.serial('chat session', () => {
  let chat: ProbedSession;

  test('every tool and command the chat is shown can be called', async () => {
    chatSessionId = await openProbeChat('probe');
    const session = stub.sessions.get('probe');
    if (!session?.done) throw new Error('The chat never finished its probe turn.');
    chat = session;
    recordSize('chat', session);
    expect(defects(session)).toEqual([]);
    // A file the chat writes is there for its own shell.
    expect(session.outcomes.map((outcome) => outcome.label)).toContain('write then bash');
  });

  test('the harness sees what the app reports for the same session', async () => {
    // The app's own context view lists the same tools, and its base prompt is the front of what the model got.
    const context = await page.evaluate((id) => window.sero.agent.getContext(id), chatSessionId);
    expect([...(context?.tools ?? []).map((tool) => tool.name)].sort()).toEqual([...chat.tools].sort());
    expect(chat.system.startsWith((context?.systemPrompt ?? '').slice(0, 2_000))).toBe(true);
  });

  test('has exactly the direct tools, and no goal or Rooms tools', () => {
    expect([...chat.tools].sort()).toEqual([...CHAT_TOOLS].sort());
    for (const name of GOAL_AND_ROOMS.filter((tool) => tool !== 'goal' && tool !== 'goals' && tool !== 'rooms')) {
      expect(chat.tools).not.toContain(name);
    }
  });

  test('reaches the moved tools as Sero CLI commands', () => {
    for (const name of MOVED_COMMANDS) expect(chat.commands).toContain(name);
    expect(chat.commands).toContain('goal');
    expect(chat.commands).toContain('rooms');
    expect(chat.commands).not.toContain('room');
  });

  test('names the Pi docs location once', () => {
    expect(chat.system.match(/Pi docs:/g)).toHaveLength(1);
    expect(chat.system).not.toContain('Pi documentation (read only when');
    const docsRoot = /Pi docs: `([^`]+)`/.exec(chat.system)?.[1];
    expect(docsRoot).toBeTruthy();
    if (RUNTIME === 'host') expect(fs.existsSync(path.join(docsRoot!, 'README.md'))).toBe(true);
  });

  test('keeps the memory and MCP blocks, and the dev server command in the runtime block', () => {
    expect(chat.system).toContain('## Memory System');
    expect(chat.system).toContain('## MCP usage');
    expect(chat.system).toContain('sero devserver register');
  });

  test('matches its runtime: a container block only in a container workspace', () => {
    expect(chat.system.includes('## Container Environment')).toBe(RUNTIME !== 'host');
    expect(chat.system.includes('## Host Runtime Environment')).toBe(RUNTIME === 'host');
    // The image facts come from Dockerfile.sero-node.
    if (RUNTIME !== 'host') expect(chat.system).toContain('Ubuntu 24.04');
  });

  test('lists no taste-pack skill, and lists pi-docs', () => {
    expect(chat.system).not.toContain('<name>taste-skill</name>');
    expect(chat.system).toContain('<name>pi-docs</name>');
  });
});

test.describe.serial('subagent session', () => {
  test('a chat starts a subagent, and every tool and command it is shown can be called', async () => {
    const session = [...stub.sessions.values()].find((candidate) => candidate.key.includes(SUBAGENT_TASK));
    if (!session?.done) throw new Error('The chat probe did not start a finished subagent session.');
    recordSize('subagent', session);
    expectOnePiDocsPointer(session);

    expect(defects(session)).toEqual([]);
    // With no allowlist, a subagent reaches plugin tools as commands, as a chat does.
    expect([...session.tools].sort()).toEqual([...SUBAGENT_TOOLS, ...(RUNTIME === 'host' ? [] : ['automation_browser'])].sort());
    for (const name of ['web_search', 'git_manager', 'graphify_query', 'mcp_manager']) expect(session.commands, name).toContain(name);
    for (const name of GOAL_AND_ROOMS) {
      expect(session.tools, name).not.toContain(name);
      expect(session.commands, name).not.toContain(name);
    }
  });
});

/** Runs a management action inside Electron main, where the Architect runtime registry lives. */
async function architect<T>(action: string, ...args: unknown[]): Promise<T> {
  return app.evaluate(async (_electron, { action: name, args: input }) => {
    const entry = (globalThis as Record<string, unknown>)['sero-architect:runtime'] as { entry: { projects: Record<string, (...a: unknown[]) => Promise<unknown>> } | null } | undefined;
    if (!entry?.entry) throw new Error('the Architect runtime is not registered');
    const fn = entry.entry.projects[name];
    if (typeof fn !== 'function') throw new Error(`no projects action ${name}`);
    return (await fn.apply(entry.entry.projects, input)) as T;
  }, { action, args });
}

function sessionWhere(text: string): ProbedSession | undefined {
  return [...stub.sessions.values()].find((candidate) => candidate.key.includes(text));
}

/** What a member never gets: the user's own controls, and tools for chat and subagents. */
const NOT_FOR_MEMBERS = ['goal', 'goals', 'goal_complete', 'goal_blocked', 'goal_wait', 'rooms', 'orchestrator', 'mcp', 'mcp_manager'];

test.describe.serial('member session (Architect owner)', () => {
  test('every tool and command the owner is shown can be called', async () => {
    const folder = path.join(home.path, 'architect-projects', `probe-${Date.now()}`);
    const created = await architect<{ ok: boolean; text: string; projectId?: string }>('create', { idea: 'A tiny probe project.', folder });
    expect(created.ok, created.text).toBe(true);
    // The owner works in the project folder, so the read and edit probes need their files there.
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, PROBE_FILE), 'probe\n');
    fs.writeFileSync(path.join(folder, PROBE_EDIT_FILE), 'alpha\n');
    // Resume asks for the owner session's grant and waits for the answer, so the call and the click overlap.
    const resuming = architect<{ ok: boolean; text: string }>('resume', created.projectId);
    const allow = page.getByRole('button', { name: 'Allow' }).first();
    await expect(allow, 'the host never asked to allow the owner session').toBeVisible({ timeout: 60_000 });
    await allow.click({ timeout: 10_000 });
    const resumed = await resuming;
    expect(resumed.ok, resumed.text).toBe(true);

    await expect.poll(() => sessionWhere(ARCHITECT_CONTRACT)?.done ?? false, { timeout: 120_000, intervals: [1_000] }).toBe(true);
    const session = sessionWhere(ARCHITECT_CONTRACT)!;
    recordSize('member', session);
    expectOnePiDocsPointer(session);

    expect(defects(session)).toEqual([]);
    for (const name of NOT_FOR_MEMBERS) {
      expect(session.tools, name).not.toContain(name);
      expect(session.commands, name).not.toContain(name);
    }
    // A member writes through the runtime, so it has the file tools.
    for (const name of ['read', 'write', 'edit', 'bash']) expect(session.tools).toContain(name);
    // The memory, MCP and Sero CLI prompt text belongs to chats.
    expect(session.system).not.toContain('## MCP usage');
  });
});

test.describe.serial('member session (Room)', () => {
  test('every tool and command a Room member is shown can be called', async () => {
    test.setTimeout(240_000);
    // The Rooms panel works on the active workspace.
    const node = page.locator(workspaceSel.nodeById(workspaceId));
    if (!(await node.isVisible())) await page.locator(layoutSel.sidebarToggle).click();
    await node.click();
    await expect.poll(() => page.evaluate(() => window.sero.layout.load()), { timeout: 10_000 }).toMatchObject({ activeWorkspaceId: workspaceId });
    const panel = page.locator('[data-app="orchestrator"]').first();
    await page.evaluate(() => window.__appControl?.openApp('orchestrator'));
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await panel.locator('nav').getByRole('button', { name: /^Rooms(?: \d+)?$/ }).click();
    // An empty panel offers "Start a Room", and one with Rooms offers "New".
    await panel.getByRole('button', { name: /^(New|Start a Room)$/ }).click();
    await panel.getByPlaceholder(/session-fixation/).fill(ROOM_BRIEF);
    await panel.getByRole('button', { name: 'Design the team' }).click();
    await expect(panel.getByRole('button', { name: 'Start room' })).toBeVisible({ timeout: 120_000 });
    await panel.getByRole('button', { name: 'Start room' }).click();
    const allow = page.getByRole('button', { name: 'Allow' }).first();
    await expect(allow, 'the host never asked to allow agent sessions').toBeVisible({ timeout: 30_000 });
    await allow.click({ timeout: 10_000 });

    const member = () => [...stub.sessions.values()].find((candidate) => candidate.key.includes(ROOM_MANDATE));
    await expect.poll(() => member()?.done ?? false, { timeout: 120_000, intervals: [1_000] }).toBe(true);
    const session = member()!;
    recordSize('room-member', session);

    expect(defects(session)).toEqual([]);
    expect(session.outcomes.map((outcome) => outcome.label)).toContain('write then bash');
    // A member has `room`, and none of the user's own controls.
    expect(session.commands).toContain('room');
    for (const name of [...NOT_FOR_MEMBERS, 'rooms']) {
      expect(session.tools, name).not.toContain(name);
      expect(session.commands, name).not.toContain(name);
    }
    for (const name of ['read', 'write', 'edit', 'bash']) expect(session.tools).toContain(name);
    // An approved tool from another plugin is provided, as a command the member can call.
    expect(session.commands).toContain('web_search');
    expect(mainLog).not.toMatch(/approved tools not provided: [^\n]*web_search/);
    if (RUNTIME !== 'host') expect(session.tools).toContain('automation_browser');
    expectOnePiDocsPointer(session);
    // A member in a container workspace works in the container, and its prompt says so.
    expect(session.system.includes('## Container Environment')).toBe(RUNTIME !== 'host');
  });
});

test.describe.serial('moved tools run for real', () => {
  test('through sero-cli in a chat', async () => {
    test.setTimeout(240_000);
    await openProbeChat(LIVE_SETUP);
    const session = stub.sessions.get(LIVE_SETUP);
    if (!session?.done) throw new Error('The live chat never finished.');
    const [mcp, settings, assets, browser] = session.outcomes.map((outcome) => outcome.detail);
    expect(defects(session)).toEqual([]);
    // `mcp_manager` answers a status action.
    expect(mcp).not.toMatch(/^\s*error/i);
    // Design Library settings read and change.
    expect(settings).toContain('View preferences saved');
    // The assets tool ran and refused an upload that does not exist, which is its own answer.
    expect(assets).not.toMatch(/unknown (command|tool)/i);
    // In a container, the hidden browser launches and closes a page.
    if (RUNTIME !== 'host') {
      expect(browser).toContain('Automation browser URL');
      expect(browser).toContain('closed');
    }
  });

  test('through the route the Design Library UI uses', async () => {
    // The UI calls plugin tools through appAgent.invokeTool, which never touches the bridge.
    const tool = (name: string, params: Record<string, unknown>) => page.evaluate(
      ({ id, toolName, args }) => window.sero.appAgent.invokeTool('design-library', id, toolName, args),
      { id: workspaceId, toolName: name, args: params },
    );
    const settings = await tool('design_library_settings', { action: 'read' });
    expect(settings.text.length).toBeGreaterThan(0);
    expect(settings.text).not.toMatch(/^\s*error/i);

    // An image import: begin, one chunk, complete. A 1x1 PNG.
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
    const begun = await tool('design_library_assets', { action: 'begin', fileName: 'probe.png', mediaType: 'image/png', originalChunks: 1, previewChunks: 0, width: 1, height: 1 });
    expect(begun.text).not.toMatch(/^\s*error/i);
    const uploadId = /"uploadId"\s*:\s*"([^"]+)"/.exec(JSON.stringify(begun))?.[1];
    expect(uploadId, `no upload id in: ${JSON.stringify(begun).slice(0, 300)}`).toBeTruthy();
    const chunk = await tool('design_library_assets', { action: 'chunk', uploadId, role: 'original', index: 0, data: png });
    expect(chunk.text).not.toMatch(/^\s*error/i);
    const done = await tool('design_library_assets', { action: 'complete', uploadId });
    expect(done.text).not.toMatch(/^\s*error/i);
  });
});

test.describe.serial('cron session', () => {
  test('a cron job starts a session, and every tool and command it is shown can be called', async () => {
    await openProbeChat(CRON_SETUP);
    await expect.poll(() => sessionWhere(CRON_PROMPT)?.done ?? false, { timeout: 120_000, intervals: [1_000] }).toBe(true);
    const session = sessionWhere(CRON_PROMPT)!;
    recordSize('cron', session);

    expect(defects(session)).toEqual([]);
    for (const name of GOAL_AND_ROOMS) expect(session.tools, name).not.toContain(name);
    // A cron session cannot run Sero CLI commands, so its prompt does not teach them.
    expect(session.tools).not.toContain('sero-cli');
    for (const heading of ['## Sero CLI', '## MCP usage', '## Memory System']) expect(session.system).not.toContain(heading);
  });
});
