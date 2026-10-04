/**
 * Pi 1.0 upgrade POC (OpenSpec change `pi-1-upgrade-poc`, tasks 1.2 and 4.1).
 *
 * `POC_MODE=create` builds one chat session on the stub model with a prompt
 * override, a disabled tool, an undo, a compaction and a fork, then copies the
 * session files to `POC_OUT`. `POC_MODE=verify` opens those copies in a fresh
 * profile, records what each one shows, and sends one more prompt. No API key
 * and no spend.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { _electron as electron, test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeSeroApp,
  createTempSeroHome,
  launchSeroApp,
  seedStubProvider,
  startStubModel,
  STUB_MODEL_ID,
  STUB_PROVIDER_ID,
  type StubModelServer,
  type StubReply,
  type StubRequest,
  type TempSeroHome,
} from './helpers';
import { getLlmCredentialEnvKeys } from './helpers/llm';
import { seedWorkflowProfile, waitForShell } from './helpers/workflow';
import type { AgentStreamEvent, ChatTurnUndoRef } from '../src/types/ipc';

const MODE = process.env.POC_MODE;
const OUT = process.env.POC_OUT ?? path.join(os.tmpdir(), 'sero-pi-poc-baseline');
const LABEL = process.env.POC_LABEL ?? 'run';
const OVERRIDE_PROMPT = 'POC_OVERRIDE_MARK You are a test agent. Reply briefly.';
const DISABLED_TOOL = 'grep';
const FILLER = 'This sentence makes the reply long enough for a compaction to have something to cut. '.repeat(12);

/** Scripts for the native Code Mode checks, chosen by the first word after `codemode:`. */
const CODEMODE_SCRIPTS: Record<string, string> = {
  three: [
    "const first = await tools.read({ path: 'README.md' });",
    "const second = await tools.bash({ command: 'sleep 2; echo two' });",
    "let third;",
    "try { third = await tools.read({ path: 'missing.txt' }); } catch (error) { third = 'failed: ' + error.message; }",
    "return JSON.stringify({ first, second, third });",
  ].join('\n'),
  read: "return await tools.read({ path: 'README.md' });",
};

function respond(request: StubRequest): StubReply {
  const last = request.messages.at(-1);
  if (last?.role === 'tool') return { text: `tool finished. ${FILLER}` };
  const text = last?.text ?? '';
  const write = /write:(\w+)/.exec(text);
  if (last?.role === 'user' && write && !text.includes('<conversation>')) {
    return { toolCalls: [{ id: `call_${write[1]}`, name: 'write', arguments: { path: 'poc.txt', content: `${write[1]}\n` } }] };
  }
  if (last?.role === 'user' && text.startsWith('call:')) {
    // The test names the tool call the model makes.
    const call = JSON.parse(text.slice('call:'.length)) as { name: string; arguments: Record<string, unknown> };
    return { toolCalls: [{ id: `call_${request.messages.length}`, name: call.name, arguments: call.arguments }] };
  }
  if (last?.role === 'user' && text.startsWith('codemode:')) {
    return { toolCalls: [{ id: 'call_codemode', name: 'codemode', arguments: { code: CODEMODE_SCRIPTS[text.slice('codemode:'.length).trim().split(' ')[0]] ?? 'return 1;' } }] };
  }
  if (last?.role === 'user' && text.startsWith('runcode:')) {
    return { toolCalls: [{ id: 'call_run_code', name: 'run_code', arguments: { code: "const file = await tools.read({ path: 'README.md' }); return file.text.trim().toUpperCase();" } }] };
  }
  if (last?.role === 'user' && text.startsWith('sleep:')) {
    return { toolCalls: [{ id: 'call_sleep', name: 'bash', arguments: { command: 'sleep 20' } }] };
  }
  if (last?.role === 'user' && text.startsWith('big:')) {
    return { toolCalls: [{ id: 'call_big', name: 'bash', arguments: { command: "head -c 24000 /dev/zero | tr '\\0' 'x'" } }] };
  }
  if (!request.tools.length) return { text: 'POC_SUMMARY the user wrote poc.txt twice and undid the second write.' };
  return { text: `reply to "${text.slice(0, 40)}". ${FILLER}` };
}

let home: TempSeroHome;
let stub: StubModelServer;
let app: ElectronApplication;
let page: Page;
let workspaceId: string;
let workspaceDir: string;
let mainLog = '';
let profilePath = '';

interface TurnResult { events: string[]; turnUndo: ChatTurnUndoRef | null }

/** Sends a prompt and waits for the turn to end. The undo point arrives after `agent_end`, so wait a little for it. */
async function turn(sessionId: string, text: string): Promise<TurnResult> {
  return page.evaluate(({ id, prompt }) => new Promise<TurnResult>((resolve, reject) => {
    const events: string[] = [];
    let turnUndo: ChatTurnUndoRef | null = null;
    let started = false;
    const fail = window.setTimeout(() => { off(); reject(new Error(`No agent_end. Events: ${events.join(', ')}`)); }, 60_000);
    const off = window.sero.agent.onEvent((event: AgentStreamEvent) => {
      if (event.sessionId !== id) return;
      events.push(event.type);
      if (event.type === 'agent_start') started = true;
      if (event.type === 'user_turn_undo') turnUndo = event.turnUndo;
      if (event.type === 'error') { window.clearTimeout(fail); off(); reject(new Error(event.error)); }
      if (event.type === 'agent_end' && started) {
        window.clearTimeout(fail);
        window.setTimeout(() => { off(); resolve({ events, turnUndo }); }, 1_500);
      }
    });
    window.sero.agent.prompt(id, prompt, undefined, `poc-${Date.now()}`).catch(reject);
  }), { id: sessionId, prompt: text });
}

async function snapshot(sessionId: string) {
  return page.evaluate(async (id) => {
    const context = await window.sero.agent.getContext(id);
    return {
      systemPrompt: context?.systemPrompt ?? null,
      tools: context?.tools.map((tool) => tool.name) ?? [],
      overrides: context?.overrides ?? null,
    };
  }, sessionId);
}

function write(name: string, value: unknown): void {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(value, null, 2));
}

test.beforeAll(async () => {
  test.skip(!MODE, 'Set POC_MODE=create or POC_MODE=verify.');
  stub = await startStubModel(respond);
  home = createTempSeroHome();
  workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-pi-poc-'));
  fs.writeFileSync(path.join(workspaceDir, 'README.md'), 'poc\n');
  fs.writeFileSync(path.join(workspaceDir, '.gitignore'), '.sero/\n');
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=poc@example.com', '-c', 'user.name=Poc', ...args], { cwd: workspaceDir, stdio: 'ignore' });
  git('init', '-b', 'main');
  git('add', '-A');
  git('commit', '-m', 'initial');
  const profile = seedWorkflowProfile(home, { profilePath: path.join(home.path, '.sero-ui', 'profiles', 'workflow-test') });
  profilePath = profile.path;
  if (MODE === 'packaged') {
    // The packaged app, not the built source tree. POC_APP is the path of the executable inside the bundle.
    const executablePath = process.env.POC_APP;
    if (!executablePath) throw new Error('Set POC_APP to the packaged executable.');
    seedStubProvider(profile.path, stub.baseUrl);
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      NODE_ENV: 'test',
      SERO_HOME_OVERRIDE: profile.path,
      SERO_HOST_ARTIFACTS_ROOT_OVERRIDE: profile.path,
      HOME: home.path,
      USERPROFILE: home.path,
      SERO_FIXED_ROOT_OVERRIDE: path.join(home.path, '.sero-ui'),
    };
    for (const key of [...getLlmCredentialEnvKeys(), 'ELECTRON_RUN_AS_NODE']) delete env[key];
    app = await electron.launch({ executablePath, env });
    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    for (const stream of [app.process().stdout, app.process().stderr]) stream?.on('data', (chunk: Buffer) => { mainLog += chunk.toString(); });
    await waitForShell(page);
    const packagedWorkspace = await page.evaluate(({ folder }) => window.sero.workspace.addFolder(folder, 'Pi POC'), { folder: workspaceDir });
    workspaceId = packagedWorkspace.id;
    return;
  }
  ({ app, page } = await launchSeroApp({
    seroHome: profile.path,
    runtime: process.env.POC_CONTAINER === '1' ? 'apple-container' : 'host',
    // A stub run must never reach a paid provider, whatever model a session falls back to.
    withoutEnv: getLlmCredentialEnvKeys().filter((key) => !(MODE === 'live' && key === 'DEEPSEEK_API_KEY')),
    env: {
      HOME: home.path,
      USERPROFILE: home.path,
      SERO_FIXED_ROOT_OVERRIDE: path.join(home.path, '.sero-ui'),
      GIT_AUTHOR_NAME: 'Poc',
      GIT_AUTHOR_EMAIL: 'poc@example.com',
      GIT_COMMITTER_NAME: 'Poc',
      GIT_COMMITTER_EMAIL: 'poc@example.com',
    },
    seed: (seroHome) => {
      seedStubProvider(seroHome, stub.baseUrl);
      fs.writeFileSync(
        path.join(seroHome, 'agent', 'settings.json'),
        JSON.stringify({ compaction: MODE === 'lifecycle' ? { enabled: true, reserveTokens: 500, keepRecentTokens: 200 } : { enabled: true, keepRecentTokens: 50 } }, null, 2),
      );
      if (process.env.POC_MIDCONVO === '1') {
        // A provider that takes system messages and tool additions in the middle of a conversation.
        const modelsPath = path.join(seroHome, 'agent', 'models.json');
        const models = JSON.parse(fs.readFileSync(modelsPath, 'utf8')) as { providers: Record<string, { compat: Record<string, boolean> }> };
        Object.assign(models.providers[STUB_PROVIDER_ID].compat, { supportsMidConvoSystemMessages: true, supportsMidConvoToolAdditions: true });
        fs.writeFileSync(modelsPath, JSON.stringify(models, null, 2));
      }
      if (MODE === 'lifecycle') {
        // A small context window, so one large tool result passes the compaction threshold.
        const modelsPath = path.join(seroHome, 'agent', 'models.json');
        const models = JSON.parse(fs.readFileSync(modelsPath, 'utf8')) as { providers: Record<string, { models: Array<{ contextWindow: number }> }> };
        models.providers[STUB_PROVIDER_ID].models[0].contextWindow = 4_000;
        fs.writeFileSync(modelsPath, JSON.stringify(models, null, 2));
      }
    },
  }));
  for (const stream of [app.process().stdout, app.process().stderr]) stream?.on('data', (chunk: Buffer) => { mainLog += chunk.toString(); });
  await waitForShell(page);
  const workspace = await page.evaluate(({ folder }) => window.sero.workspace.addFolder(folder, 'Pi POC'), { folder: workspaceDir });
  workspaceId = workspace.id;
});

test.afterAll(async () => {
  if (MODE) write(`${MODE}-${LABEL}-main.log.json`, mainLog.split('\n').filter((line) => /error|warn|context-editor|pi-sdk/i.test(line)).slice(-200));
  try {
    if (app) await closeSeroApp(app);
  } finally {
    await stub?.close();
    home?.cleanup();
    if (workspaceDir) fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
});

test('create the baseline session', async () => {
  test.skip(MODE !== 'create');
  const created = await page.evaluate(async ({ id, provider, model }) => {
    const session = await window.sero.sessions.create(id);
    await window.sero.agent.open(session.id, session.path, id);
    await window.sero.agent.setModel(session.id, provider, model);
    return session;
  }, { id: workspaceId, provider: STUB_PROVIDER_ID, model: STUB_MODEL_ID });

  const steps: Record<string, unknown> = {};
  await page.evaluate(({ id, prompt, tool }) => window.sero.agent.setContextOverrides(id, { systemPrompt: prompt, disabledTools: [tool] }), { id: created.id, prompt: OVERRIDE_PROMPT, tool: DISABLED_TOOL });
  steps.first = await turn(created.id, 'write:one');
  const second = await turn(created.id, 'write:two');
  steps.second = second;
  if (second.turnUndo) {
    const page1 = await page.evaluate(({ id, ref }) => window.sero.agent.undoToTurn(id, ref), { id: created.id, ref: second.turnUndo });
    steps.undo = { messages: page1.messages.length, file: fs.readFileSync(path.join(workspaceDir, 'poc.txt'), 'utf8') };
  } else {
    steps.undo = 'no undo point was offered';
  }
  steps.third = await turn(created.id, 'third plain turn');
  steps.compact = await page.evaluate((id) => window.sero.agent.compact(id).then((result) => result, (error: unknown) => ({ error: String(error) })), created.id);
  steps.fourth = await turn(created.id, 'after compaction');
  const fork = await page.evaluate(async ({ id, ws }) => {
    const forked = await window.sero.agent.forkSession(id);
    await window.sero.agent.open(forked.id, forked.path, ws);
    return forked;
  }, { id: created.id, ws: workspaceId });
  steps.fork = await turn(fork.id, 'in the fork');
  steps.parentAfterFork = await turn(created.id, 'in the parent');

  fs.mkdirSync(OUT, { recursive: true });
  const sessions = [{ name: 'parent', info: created }, { name: 'fork', info: fork }];
  for (const { name, info } of sessions) {
    fs.copyFileSync(info.path, path.join(OUT, `${name}.jsonl`));
    const history = await page.evaluate(({ id, file, ws }) => window.sero.agent.open(id, file, ws), { id: info.id, file: info.path, ws: workspaceId });
    write(`create-${name}.json`, { id: info.id, context: await snapshot(info.id), messages: history.messages.map((message) => ({ type: message.type, text: JSON.stringify(message).slice(0, 300) })) });
  }
  write('create-steps.json', steps);
  write('create-requests.json', stub.requests.map((request) => ({ system: request.system.slice(0, 200), tools: request.tools.map((tool) => tool.name), messages: request.messages.map((message) => `${message.role}: ${message.text.slice(0, 60)}${message.toolCalls.map((call) => ` [${call.name}]`).join('')}`) })));

  const last = stub.requests.at(-1);
  expect(last?.system).toContain('POC_OVERRIDE_MARK');
  expect(last?.tools.map((tool) => tool.name)).not.toContain(DISABLED_TOOL);
  expect(fs.existsSync(path.join(OUT, 'parent.jsonl'))).toBe(true);
  expect(fs.existsSync(path.join(OUT, 'fork.jsonl'))).toBe(true);
});

test('open the baseline copies', async () => {
  test.skip(MODE !== 'verify');
  const result: Record<string, unknown> = {};
  for (const name of ['parent', 'fork']) {
    const source = path.join(OUT, `${name}.jsonl`);
    const header = JSON.parse(fs.readFileSync(source, 'utf8').split('\n')[0]) as { id: string };
    const copy = path.join(home.path, `${name}-${LABEL}.jsonl`);
    fs.copyFileSync(source, copy);
    const history = await page.evaluate(({ id, file, ws }) => window.sero.agent.open(id, file, ws), { id: header.id, file: copy, ws: workspaceId });
    const context = await snapshot(header.id);
    const before = stub.requests.length;
    const events = await turn(header.id, `resume ${name}`);
    const request = stub.requests[before];
    result[name] = {
      messages: history.messages.map((message) => ({ type: message.type, text: JSON.stringify(message).slice(0, 300) })),
      context,
      events: events.events,
      request: { system: request?.system.slice(0, 200), tools: request?.tools.map((tool) => tool.name), messages: request?.messages.map((message) => `${message.role}: ${message.text.slice(0, 60)}${message.toolCalls.map((call) => ` [${call.name}]`).join('')}`) },
      fileAfter: fs.readFileSync(copy, 'utf8').split('\n').filter(Boolean).map((line) => (JSON.parse(line) as { type: string; customType?: string }).type),
    };
    expect(request?.system).toContain('POC_OVERRIDE_MARK');
    expect(request?.tools.map((tool) => tool.name)).not.toContain(DISABLED_TOOL);
  }
  write(`verify-${LABEL}.json`, result);
});

test('record the start-up size of a host chat', async () => {
  test.skip(MODE !== 'size');
  const before = stub.requests.length;
  const created = await page.evaluate(async ({ id, provider, model }) => {
    const session = await window.sero.sessions.create(id);
    await window.sero.agent.open(session.id, session.path, id);
    await window.sero.agent.setModel(session.id, provider, model);
    return session;
  }, { id: workspaceId, provider: STUB_PROVIDER_ID, model: STUB_MODEL_ID });
  await turn(created.id, 'size probe');
  const request = stub.requests[before];
  const tools = request.tools.map((tool) => ({ name: tool.name, chars: JSON.stringify(tool).length }));
  const toolSchemaChars = tools.reduce((sum, tool) => sum + tool.chars, 0);
  write(`size-${LABEL}.json`, { systemChars: request.system.length, toolSchemaChars, totalChars: request.system.length + toolSchemaChars, tools });
  fs.writeFileSync(path.join(OUT, `size-${LABEL}-system.txt`), request.system);
  write(`size-${LABEL}-tools.json`, request.tools);
  expect(tools.length).toBeGreaterThan(0);

  // Cache warming: what the profile's settings say, and what the live session reports.
  const settings = JSON.parse(fs.readFileSync(path.join(profilePath, 'agent', 'settings.json'), 'utf8')) as { cacheWarming?: string };
  const status = await app.evaluate((_electron, id) => {
    const getEntry = (globalThis as Record<string, unknown>).__seroTestGetAgentPoolEntry as
      | ((sessionId: string) => { session: { cacheWarmingStatus?: unknown } } | undefined)
      | undefined;
    return getEntry?.(id)?.session.cacheWarmingStatus ?? null;
  }, created.id);
  write(`cache-warming-${LABEL}.json`, { setting: settings.cacheWarming ?? null, status, requests: stub.requests.length - before });
});

test('an override set before the first message is on disk when the session is reopened', async () => {
  test.skip(MODE !== 'reopen');
  const created = await page.evaluate(async ({ id, provider, model }) => {
    const session = await window.sero.sessions.create(id);
    await window.sero.agent.open(session.id, session.path, id);
    await window.sero.agent.setModel(session.id, provider, model);
    return session;
  }, { id: workspaceId, provider: STUB_PROVIDER_ID, model: STUB_MODEL_ID });
  await page.evaluate(({ id, prompt, tool }) => window.sero.agent.setContextOverrides(id, { systemPrompt: prompt, disabledTools: [tool] }), { id: created.id, prompt: OVERRIDE_PROMPT, tool: DISABLED_TOOL });
  const onDisk = fs.readFileSync(created.path, 'utf8').split('\n').filter(Boolean).map((line) => (JSON.parse(line) as { type: string; customType?: string }));
  expect(onDisk.some((entry) => entry.customType === 'sero-context-overrides')).toBe(true);

  await page.evaluate((id) => window.sero.agent.close(id), created.id);
  // A session with no messages does not restore its model on reopen, so set the stub again.
  await page.evaluate(async ({ id, file, ws, provider, model }) => {
    await window.sero.agent.open(id, file, ws);
    await window.sero.agent.setModel(id, provider, model);
  }, { id: created.id, file: created.path, ws: workspaceId, provider: STUB_PROVIDER_ID, model: STUB_MODEL_ID });
  const context = await snapshot(created.id);
  expect(context.overrides).toEqual({ systemPrompt: OVERRIDE_PROMPT, disabledTools: [DISABLED_TOOL] });

  const before = stub.requests.length;
  await turn(created.id, 'first message after reopen');
  expect(stub.requests[before].system).toContain('POC_OVERRIDE_MARK');
  expect(stub.requests[before].tools.map((tool) => tool.name)).not.toContain(DISABLED_TOOL);

  // A reset restores the base prompt and the tool.
  await page.evaluate((id) => window.sero.agent.setContextOverrides(id, null), created.id);
  const afterReset = stub.requests.length;
  await turn(created.id, 'after reset');
  expect(stub.requests[afterReset].system).not.toContain('POC_OVERRIDE_MARK');
  expect(stub.requests[afterReset].system).toContain('You are an expert coding assistant');
  expect(stub.requests[afterReset].tools.map((tool) => tool.name)).toContain(DISABLED_TOOL);
  write(`reopen-${LABEL}.json`, { entries: onDisk.map((entry) => entry.customType ?? entry.type), resetSystemStart: stub.requests[afterReset].system.slice(0, 120) });
});

test('session actions change the next request as expected', async () => {
  test.skip(MODE !== 'actions');
  const created = await page.evaluate(async ({ id, provider, model }) => {
    const session = await window.sero.sessions.create(id);
    await window.sero.agent.open(session.id, session.path, id);
    await window.sero.agent.setModel(session.id, provider, model);
    return session;
  }, { id: workspaceId, provider: STUB_PROVIDER_ID, model: STUB_MODEL_ID });
  const rows: Record<string, unknown> = {};
  const requestAfter = async (prompt: string) => {
    const before = stub.requests.length;
    await turn(created.id, prompt);
    const request = stub.requests[before];
    return {
      system: request.system,
      tools: request.tools.map((tool) => tool.name),
      messages: request.messages.map((message) => `${message.role}: ${message.text.slice(0, 50)}${message.toolCalls.map((call) => ` [${call.name}]`).join('')}`),
    };
  };

  // Legacy restore. An old session marks its checkpoints with a `git-checkpoint` entry.
  const first = await turn(created.id, 'write:one');
  const snapshotId = first.turnUndo?.snapshotId;
  if (!snapshotId) throw new Error('The first turn offered no undo point.');
  await app.evaluate((_electron, { id, changeId }) => {
    const getEntry = (globalThis as Record<string, unknown>).__seroTestGetAgentPoolEntry as
      (sessionId: string) => { session: { sessionManager: { appendCustomEntry(type: string, data: unknown): string } } } | undefined;
    getEntry(id)?.session.sessionManager.appendCustomEntry('git-checkpoint', { changeId });
  }, { id: created.id, changeId: snapshotId });
  await turn(created.id, 'write:two');
  await page.evaluate(({ id, changeId }) => window.sero.agent.restoreToCheckpoint(id, changeId), { id: created.id, changeId: snapshotId });
  const afterRestore = await requestAfter('after legacy restore');
  // The snapshot is the one taken before the first turn, so the file it wrote is gone again.
  rows.legacyRestore = { fileExists: fs.existsSync(path.join(workspaceDir, 'poc.txt')), messages: afterRestore.messages };
  expect(afterRestore.messages.join('\n')).toContain('write:one');
  expect(afterRestore.messages.join('\n')).not.toContain('write:two');

  // Direct message insertion: a `sero` prompt runs the command and writes three messages, with no model call.
  const beforeDirect = stub.requests.length;
  await turn(created.id, 'sero help');
  expect(stub.requests.length).toBe(beforeDirect);
  const afterDirect = await requestAfter('after direct command');
  rows.directInsertion = { messages: afterDirect.messages.slice(-5) };
  expect(afterDirect.messages.slice(-4, -1).map((message) => message.split(':')[0])).toEqual(['user', 'assistant', 'tool']);
  expect(afterDirect.messages.at(-4)).toContain('sero help');

  // Extension reload keeps the override and the disabled tool.
  await page.evaluate(({ id, prompt, tool }) => window.sero.agent.setContextOverrides(id, { systemPrompt: prompt, disabledTools: [tool] }), { id: created.id, prompt: OVERRIDE_PROMPT, tool: DISABLED_TOOL });
  await page.evaluate((id) => window.sero.agent.reloadResources(id), created.id);
  const afterReload = await requestAfter('after reload');
  rows.extensionReload = { systemStart: afterReload.system.slice(0, 80), tools: afterReload.tools };
  expect(afterReload.system.startsWith('POC_OVERRIDE_MARK')).toBe(true);
  expect(afterReload.system).toContain('## Sero CLI');
  expect(afterReload.tools).not.toContain(DISABLED_TOOL);

  // Clear starts the conversation again.
  await page.evaluate((id) => window.sero.agent.clearSession(id), created.id);
  const afterClear = await requestAfter('after clear');
  rows.clear = { messages: afterClear.messages, systemStart: afterClear.system.slice(0, 80), tools: afterClear.tools };
  expect(afterClear.messages).toEqual(['user: after clear']);

  write(`actions-${LABEL}.json`, rows);
});

test('cancelling a tool and compacting in the middle of a turn', async () => {
  test.skip(MODE !== 'lifecycle');
  const created = await page.evaluate(async ({ id, provider, model }) => {
    const session = await window.sero.sessions.create(id);
    await window.sero.agent.open(session.id, session.path, id);
    await window.sero.agent.setModel(session.id, provider, model);
    return session;
  }, { id: workspaceId, provider: STUB_PROVIDER_ID, model: STUB_MODEL_ID });
  const shape = (request: StubRequest | undefined) => request?.messages.map((message) => `${message.role}: ${message.text.slice(0, 40)}${message.toolCalls.map((call) => ` [${call.name}]`).join('')}`);
  const rows: Record<string, unknown> = {};

  // Cancel while `bash` runs.
  const cancelled = await page.evaluate(({ id }) => new Promise<{ events: string[]; outcome: string | null; ms: number }>((resolve, reject) => {
    const events: string[] = [];
    const startedAt = Date.now();
    const fail = window.setTimeout(() => { off(); reject(new Error(`No agent_end. Events: ${events.join(', ')}`)); }, 40_000);
    const off = window.sero.agent.onEvent((event: AgentStreamEvent) => {
      if (event.sessionId !== id) return;
      events.push(event.type === 'tool_end' ? `tool_end(error=${String(event.isError)})` : event.type === 'error' ? `error(${event.error.slice(0, 160)})` : event.type);
      if (event.type === 'tool_start') void window.sero.agent.abort(id);
      if (event.type === 'agent_end') {
        window.clearTimeout(fail);
        off();
        resolve({ events, outcome: event.outcome ?? null, ms: Date.now() - startedAt });
      }
    });
    window.sero.agent.prompt(id, 'sleep: run a long command', undefined, `poc-${Date.now()}`).catch(reject);
  }), { id: created.id });
  write(`lifecycle-${LABEL}.json`, { cancelled });
  const beforeNext = stub.requests.length;
  await turn(created.id, 'after cancel');
  rows.cancel = { ...cancelled, nextRequest: shape(stub.requests[beforeNext]) };
  write(`lifecycle-${LABEL}.json`, rows);
  // The abort reaches the tool: the turn ends long before the 20 second sleep does.
  expect(cancelled.ms).toBeLessThan(15_000);

  // One large tool result passes the compaction threshold before the model answers it.
  const beforeBig = stub.requests.length;
  const big = await turn(created.id, 'big: print a long line');
  rows.autoCompaction = {
    events: big.events,
    requests: stub.requests.slice(beforeBig).map((request) => ({ tools: request.tools.length, messages: shape(request) })),
    fileEntries: fs.readFileSync(created.path, 'utf8').split('\n').filter(Boolean).map((line) => {
      const entry = JSON.parse(line) as { type: string; customType?: string; message?: { role?: string } };
      return entry.customType ?? entry.message?.role ?? entry.type;
    }),
  };
  const history = await page.evaluate(({ id, file, ws }) => window.sero.agent.open(id, file, ws), { id: created.id, file: created.path, ws: workspaceId });
  rows.historyAfter = history.messages.map((message) => message.type);
  write(`lifecycle-${LABEL}.json`, rows);
});

test('the packaged app runs a chat turn with a run_code call', async () => {
  test.skip(MODE !== 'packaged');
  const created = await page.evaluate(async ({ id, provider, model }) => {
    const session = await window.sero.sessions.create(id);
    await window.sero.agent.open(session.id, session.path, id);
    await window.sero.agent.setModel(session.id, provider, model);
    return session;
  }, { id: workspaceId, provider: STUB_PROVIDER_ID, model: STUB_MODEL_ID });
  const before = stub.requests.length;
  const code = SCRIPT_TOOL === 'run_code'
    ? "const file = await tools.read({ path: 'README.md' }); return file.text.trim().toUpperCase();"
    : "const file = await tools.read({ path: 'README.md' }); return String(file).trim().toUpperCase();";
  const result = await turn(created.id, `call:${JSON.stringify({ name: SCRIPT_TOOL, arguments: { code } })}`);
  const first = stub.requests[before];
  const second = stub.requests[before + 1];
  const toolResult = second.messages.find((message) => message.role === 'tool')?.text ?? '';
  write(`packaged-${LABEL}.json`, {
    isPackaged: await app.evaluate(({ app: electronApp }) => electronApp.isPackaged),
    version: await app.evaluate(({ app: electronApp }) => electronApp.getVersion()),
    events: result.events,
    tools: first.tools.map((tool) => tool.name),
    pluginBlocks: ['## MCP usage', '## Memory', '## Sero CLI'].filter((heading) => first.system.includes(heading)),
    toolResult: toolResult.slice(0, 200),
  });
  expect(toolResult).toContain('POC');
  // A plugin's extension is a source file that Pi loads through jiti. Its prompt block proves it loaded.
  expect(first.system).toContain('## MCP usage');
});

test('a codemode script shows its inner calls inside its card as they occur', async () => {
  test.skip(MODE !== 'codemode');
  const created = await page.evaluate(async ({ id, provider, model }) => {
    const session = await window.sero.sessions.create(id);
    await window.sero.agent.open(session.id, session.path, id);
    await window.sero.agent.setModel(session.id, provider, model);
    await window.sero.sessions.rename(session.id, 'Code Mode POC');
    window.dispatchEvent(new Event('sero:workspace-changed'));
    return session;
  }, { id: workspaceId, provider: STUB_PROVIDER_ID, model: STUB_MODEL_ID });
  await page.locator(`[data-testid="session-item"][data-session-id="${created.id}"]`).click();
  await expect(page.locator('textarea[name="message"]')).toBeEnabled({ timeout: 10_000 });

  // Every tool event of the turn, with its parent, as the renderer receives it.
  await page.evaluate((id) => {
    const log: string[] = [];
    (window as unknown as { __pocEvents: string[] }).__pocEvents = log;
    window.sero.agent.onEvent((event: AgentStreamEvent) => {
      if (event.sessionId !== id) return;
      if (event.type === 'tool_start') log.push(`tool_start ${event.tool.toolName} id=${event.tool.toolCallId} parent=${event.tool.parentToolCallId ?? '-'}`);
      else if (event.type === 'tool_end') log.push(`tool_end id=${event.toolCallId} parent=${event.parentToolCallId ?? '-'} error=${String(event.isError)}`);
      else if (event.type === 'agent_end') log.push('agent_end');
    });
  }, created.id);

  // Frames for a recording of the live turn: one screenshot after another until the test stops the loop.
  const frames = path.join(OUT, 'codemode-frames');
  fs.mkdirSync(frames, { recursive: true });
  let recording = true;
  const recorder = (async () => {
    for (let frame = 0; recording && frame < 400; frame += 1) {
      await page.screenshot({ path: path.join(frames, `f${String(frame).padStart(4, '0')}.png`) }).catch(() => undefined);
    }
  })();

  const before = stub.requests.length;
  await page.locator('textarea[name="message"]').fill('codemode: three calls');
  await page.locator('button[aria-label="Submit"]').click();

  const shots = path.join(OUT, 'codemode-shots');
  fs.mkdirSync(shots, { recursive: true });
  const rowCounts: number[] = [];
  const events = () => page.evaluate(() => (window as unknown as { __pocEvents: string[] }).__pocEvents);
  // One screenshot when each inner call starts, and one when the turn ends.
  for (const [index, marker] of ['parent=call_codemode', 'bash id=call_codemode/2', 'read id=call_codemode/3', 'agent_end'].entries()) {
    await expect.poll(async () => (await events()).filter((line) => line.includes(marker)).length, { timeout: 30_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(shots, `${index + 1}-${marker.replace(/[^a-z0-9]+/gi, '-')}.png`) });
    rowCounts.push((await events()).filter((line) => line.startsWith('tool_start') && !line.endsWith('parent=-')).length);
  }

  // The card collapses when the turn ends. Open it again to show the settled rows.
  await page.getByText('codemode', { exact: true }).last().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shots, '5-after-the-turn-expanded.png') });
  await page.waitForTimeout(1_000);
  recording = false;
  await recorder;

  const log = await events();
  const toolMessages = await page.evaluate(({ id, file, ws }) => window.sero.agent.open(id, file, ws), { id: created.id, file: created.path, ws: workspaceId });
  const reloaded = toolMessages.messages.filter((message) => message.type === 'tool');
  const result = stub.requests[before + 1]?.messages.find((message) => message.role === 'tool')?.text ?? '';
  write(`codemode-${LABEL}.json`, {
    events: log,
    rowCounts,
    tools: stub.requests[before].tools.map((tool) => tool.name),
    scriptResult: result.slice(0, 600),
    reloaded: reloaded.map((message) => message.type === 'tool' ? { tool: message.toolName, nested: message.nested?.map((call) => ({ tool: call.toolName, state: call.state, input: call.input, output: call.output })) } : null),
  });

  // No inner call arrives as a top-level call, and a failed call shows as failed.
  expect(log.filter((line) => line.startsWith('tool_start') && line.endsWith('parent=-'))).toHaveLength(1);
  expect(log.filter((line) => line.startsWith('tool_start') && line.endsWith('parent=call_codemode'))).toHaveLength(3);
  expect(log.some((line) => line.startsWith('tool_end id=call_codemode/3') && line.endsWith('error=true'))).toBe(true);
  expect(stub.requests[before].tools.map((tool) => tool.name)).not.toContain('run_code');
});

// ── run_code against codemode (tasks 6.3 to 6.6) ─────────────────────────────

const SCRIPT_TOOL = process.env.SERO_POC_RUN_CODE === '1' ? 'run_code' : 'codemode';
/** A script per tool, because the two tools hand results to a script in different shapes. */
type Script = { run_code: string; codemode: string };
const same = (code: string): Script => ({ run_code: code, codemode: code });

interface CallResult { text: string; isError: boolean | null; nested: string[]; ms: number; events: string[] }

/** Has the stub model call one tool, and returns what came back to the model. */
async function callTool(sessionId: string, name: string, args: Record<string, unknown>, abortAfterMs?: number): Promise<CallResult> {
  const before = stub.requests.length;
  const seen = await page.evaluate(({ id, prompt, abortAfter }) => new Promise<{ isError: boolean | null; nested: string[]; ms: number; events: string[] }>((resolve, reject) => {
    const nested: string[] = [];
    const events: string[] = [];
    let isError: boolean | null = null;
    let started = false;
    const startedAt = Date.now();
    const fail = window.setTimeout(() => { off(); reject(new Error(`No agent_end. Events: ${events.join(', ')}`)); }, 110_000);
    const off = window.sero.agent.onEvent((event: AgentStreamEvent) => {
      if (event.sessionId !== id) return;
      events.push(event.type);
      if (event.type === 'agent_start') started = true;
      if (event.type === 'tool_start' && event.tool.parentToolCallId) nested.push(`start ${event.tool.toolName}`);
      if (event.type === 'tool_start' && !event.tool.parentToolCallId && abortAfter) window.setTimeout(() => void window.sero.agent.abort(id), abortAfter);
      if (event.type === 'tool_end' && event.parentToolCallId) nested.push(`end error=${String(event.isError)} ${(event.output ?? '').slice(0, 80)}`);
      if (event.type === 'tool_end' && !event.parentToolCallId) isError = event.isError;
      if (event.type === 'agent_end' && started) { window.clearTimeout(fail); off(); resolve({ isError, nested, ms: Date.now() - startedAt, events }); }
    });
    window.sero.agent.prompt(id, prompt, undefined, `poc-${Date.now()}`).catch(reject);
  }), { id: sessionId, prompt: `call:${JSON.stringify({ name, arguments: args })}`, abortAfter: abortAfterMs ?? 0 });
  const text = stub.requests[before + 1]?.messages.findLast((message) => message.role === 'tool')?.text ?? '';
  return { text, ...seen };
}

async function newStubSession(): Promise<{ id: string; path: string }> {
  return page.evaluate(async ({ id, provider, model }) => {
    const session = await window.sero.sessions.create(id);
    await window.sero.agent.open(session.id, session.path, id);
    await window.sero.agent.setModel(session.id, provider, model);
    return { id: session.id, path: session.path };
  }, { id: workspaceId, provider: STUB_PROVIDER_ID, model: STUB_MODEL_ID });
}

test('behaviour of the script tool', async () => {
  test.skip(MODE !== 'compare');
  test.setTimeout(600_000);
  // A 1x1 PNG, for the image case.
  fs.writeFileSync(path.join(workspaceDir, 'dot.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
  const inContainer = process.env.POC_CONTAINER === '1';
  if (inContainer) {
    await page.evaluate(async (id) => {
      await window.sero.workspace.setContainer(id, true);
      await window.sero.container.ensure(id);
    }, workspaceId);
  }
  const session = await newStubSession();
  const rows: Record<string, unknown> = { tool: SCRIPT_TOOL, runtime: inContainer ? 'apple-container' : 'host' };
  const run = async (script: Script, abortAfterMs?: number) => {
    const result = await callTool(session.id, SCRIPT_TOOL, { code: script[SCRIPT_TOOL] }, abortAfterMs);
    return { text: result.text.slice(0, 500), isError: result.isError, nested: result.nested, ms: result.ms };
  };

  // Where a nested bash runs: Linux in a container workspace, Darwin on the host.
  rows.nestedBashKernel = await run({
    run_code: "const r = await tools.bash({ command: 'uname -s' }); return r.text.split('\\n')[0];",
    codemode: "const r = await tools.bash({ command: 'uname -s' }); return String(r).split('\\n')[0];",
  });
  const directKernel = await callTool(session.id, 'bash', { command: 'uname -s' });
  rows.directBashKernel = directKernel.text.split('\n')[0];
  // 6.3 behaviour
  rows.typescript = await run(same('const n: number = 2; return n * 2;'));
  rows.identifier = await run({
    run_code: "const r = await tools.call({ name: 'sero-cli', args: { command: 'help' } }); return r.text.slice(0, 30);",
    codemode: "const r = await tools.sero_cli({ command: 'help' }); return String(r).slice(0, 30);",
  });
  rows.textShape = await run(same("const r = await tools.read({ path: 'README.md' }); return typeof r + ' ' + JSON.stringify(r).slice(0, 120);"));
  rows.structuredShape = await run(same("const r = await tools.bash({ command: 'echo hi' }); return typeof r + ' ' + JSON.stringify(r).slice(0, 200);"));
  rows.nestedError = await run(same("const r = await tools.read({ path: 'missing.txt' }); return 'not reached ' + typeof r;"));
  rows.image = await run(same("const r = await tools.read({ path: 'dot.png' }); return typeof r + ' ' + JSON.stringify(r).slice(0, 160);"));
  rows.concurrency = await run(same("const t = Date.now(); await Promise.all([tools.bash({ command: 'sleep 2' }), tools.bash({ command: 'sleep 2' })]); return Date.now() - t;"));
  rows.limit = await run({
    run_code: 'while (true) {}',
    codemode: '// @options: {"timeout_ms": 3000}\nwhile (true) {}',
  });

  // 6.5 a failing bash inside a script, a failing bash called directly, and a cancel in the middle of a script
  rows.failingBashInScript = await run(same("try { const r = await tools.bash({ command: 'echo out; exit 3' }); return 'resolved ' + JSON.stringify(r).slice(0, 160); } catch (error) { return 'rejected ' + error.message.slice(0, 160); }"));
  const direct = await callTool(session.id, 'bash', { command: 'echo out; exit 3' });
  rows.failingBashDirect = { text: direct.text.slice(0, 200), isError: direct.isError };
  rows.cancel = await run(same("await tools.bash({ command: 'sleep 20' }); return 'not reached';"), 1_000);

  // 6.4 restrictions on a host workspace: a tool disabled in the context editor
  await page.evaluate(({ id }) => window.sero.agent.setContextOverrides(id, { disabledTools: ['grep'] }), { id: session.id });
  const disabledDirect = await callTool(session.id, 'grep', { pattern: 'poc' });
  rows.disabledTool = {
    direct: { text: disabledDirect.text.slice(0, 160), isError: disabledDirect.isError },
    script: await run(same("try { const r = await tools.grep({ pattern: 'poc' }); return 'REACHED ' + JSON.stringify(r).slice(0, 80); } catch (error) { return 'rejected ' + error.message.slice(0, 160); }")),
    discovery: SCRIPT_TOOL === 'codemode'
      ? await run(same("return JSON.stringify({ inAll: ALL_TOOLS.some((t) => (t.name ?? t) === 'grep'), search: (await searchTools('grep')).map((t) => t.name), describe: String(await describeTool('grep')).slice(0, 60) });"))
      : await run(same("return JSON.stringify({ hasFunction: typeof tools.grep, keys: Object.keys(tools) });")),
  };
  // a tool the chat session kind does not get
  const droppedDirect = await callTool(session.id, 'goal_complete', {});
  rows.droppedTool = {
    direct: { text: droppedDirect.text.slice(0, 160), isError: droppedDirect.isError },
    script: await run(same("try { const r = await tools.goal_complete({}); return 'REACHED ' + JSON.stringify(r).slice(0, 80); } catch (error) { return 'rejected ' + error.message.slice(0, 160); }")),
    discovery: SCRIPT_TOOL === 'codemode'
      ? await run(same("return JSON.stringify({ search: (await searchTools('goal complete')).map((t) => t.name), describe: String(await describeTool('goal_complete')).slice(0, 60) });"))
      : await run(same("return JSON.stringify({ hasFunction: typeof tools.goal_complete });")),
  };
  write(`compare-${SCRIPT_TOOL}${process.env.POC_CONTAINER === '1' ? '-container' : ''}.json`, rows);

  // a call the permission gate blocks. Nobody answers the question, so the gate blocks after its 30 second limit.
  // `echo shutdown` matches the gate and is harmless if it runs.
  const blockedDirect = await callTool(session.id, 'bash', { command: 'echo shutdown' });
  rows.blockedTool = {
    direct: { text: blockedDirect.text.slice(0, 200), isError: blockedDirect.isError, ms: blockedDirect.ms },
    script: await run(same("try { const r = await tools.bash({ command: 'echo shutdown' }); return 'REACHED ' + JSON.stringify(r).slice(0, 120); } catch (error) { return 'rejected ' + error.message.slice(0, 200); }")),
  };
  write(`compare-${SCRIPT_TOOL}${process.env.POC_CONTAINER === '1' ? '-container' : ''}.json`, rows);
});

test('store and load across a fork and an undo', async () => {
  test.skip(MODE !== 'store');
  test.setTimeout(300_000);
  const session = await newStubSession();
  const script = async (id: string, code: string) => {
    const result = await turn(id, `call:${JSON.stringify({ name: 'codemode', arguments: { code } })}`);
    const text = stub.requests.at(-1)?.messages.findLast((message) => message.role === 'tool')?.text ?? '';
    return { value: text.split('Output:\n\n')[1] ?? text, turnUndo: result.turnUndo };
  };
  const LOAD = "return String(await load('k'));";
  const rows: Record<string, unknown> = {};
  rows.parentWritesA = (await script(session.id, "await store('k', 'A'); return String(await load('k'));")).value;
  const second = await script(session.id, "await tools.write({ path: 'store.txt', content: 'b' }); await store('k', 'B'); return String(await load('k'));");
  rows.parentWritesB = second.value;
  const fork = await page.evaluate(async ({ id, ws }) => {
    const forked = await window.sero.agent.forkSession(id);
    await window.sero.agent.open(forked.id, forked.path, ws);
    return forked;
  }, { id: session.id, ws: workspaceId });
  rows.forkReadsBeforeWrite = (await script(fork.id, LOAD)).value;
  rows.forkWritesF = (await script(fork.id, "await store('k', 'F'); await store('onlyFork', 1); return String(await load('k'));")).value;
  // forkSession leaves the parent's writer on the fork's file (seen on 0.84.2 too), so reopen the parent first.
  await page.evaluate(({ id, file, ws }) => window.sero.agent.open(id, file, ws), { id: session.id, file: session.path, ws: workspaceId });
  rows.parentReadsAfterFork = (await script(session.id, "return String(await load('k')) + ' onlyFork=' + String(await load('onlyFork'));")).value;
  rows.undoOffered = Boolean(second.turnUndo);
  if (second.turnUndo) {
    await page.evaluate(({ id, ref }) => window.sero.agent.undoToTurn(id, ref), { id: session.id, ref: second.turnUndo });
    rows.parentReadsAfterUndo = (await script(session.id, LOAD)).value;
  }
  rows.forkReadsAtEnd = (await script(fork.id, LOAD)).value;
  rows.storeEntriesInParentFile = fs.readFileSync(session.path, 'utf8').split('\n').filter((line) => line.includes('codemode-store')).length;
  write('store-native.json', rows);
});

// ── One paid run on deepseek/deepseek-flash (task 6.7). Every other provider key is stripped at launch. ──

const LIVE_TASKS = [
  'Count the lines in each file in data/ and tell me the total. Do it in one call of the script tool.',
  'Which files in data/ hold the word TODO, and on which line numbers? Do it in one call of the script tool.',
  'Write out/first-lines.txt with the first line of each file in data/, one per line, then read it back and show it. Do it in one call of the script tool.',
];

test('three tasks on a paid model', async () => {
  test.skip(MODE !== 'live');
  test.setTimeout(900_000);
  fs.mkdirSync(path.join(workspaceDir, 'data'));
  for (let index = 1; index <= 5; index += 1) {
    const lines = Array.from({ length: index * 7 }, (_, line) => (line === index ? `TODO item ${index}` : `file ${index} line ${line + 1}`));
    if (index % 2 === 0) lines[index] = `note ${index}`;
    fs.writeFileSync(path.join(workspaceDir, 'data', `f${index}.txt`), `${lines.join('\n')}\n`);
  }
  const rows: unknown[] = [];
  for (const task of LIVE_TASKS) {
    const session = await page.evaluate(async ({ id }) => {
      const created = await window.sero.sessions.create(id);
      await window.sero.agent.open(created.id, created.path, id);
      await window.sero.agent.setModel(created.id, 'deepseek', 'deepseek-flash');
      return { id: created.id, path: created.path };
    }, { id: workspaceId });
    const seen = await page.evaluate(({ id, prompt }) => new Promise<{ topLevel: string[]; nested: number; ms: number; error: string | null }>((resolve) => {
      const topLevel: string[] = [];
      let nested = 0;
      let started = false;
      const startedAt = Date.now();
      const done = (error: string | null) => { window.clearTimeout(fail); off(); resolve({ topLevel, nested, ms: Date.now() - startedAt, error }); };
      const fail = window.setTimeout(() => done('no agent_end in 240 s'), 240_000);
      const off = window.sero.agent.onEvent((event: AgentStreamEvent) => {
        if (event.sessionId !== id) return;
        if (event.type === 'agent_start') started = true;
        if (event.type === 'tool_start') { if (event.tool.parentToolCallId) nested += 1; else topLevel.push(event.tool.toolName); }
        if (event.type === 'error') done(event.error);
        if (event.type === 'agent_end' && started) done(null);
      });
      window.sero.agent.prompt(id, prompt, undefined, `poc-${Date.now()}`).catch((error: unknown) => done(String(error)));
    }), { id: session.id, prompt: task });
    const usage = await page.evaluate((id) => window.sero.agent.getUsage(id), session.id);
    const history = await page.evaluate(({ id, file, ws }) => window.sero.agent.open(id, file, ws), { id: session.id, file: session.path, ws: workspaceId });
    const answer = JSON.stringify(history.messages.at(-1)).slice(0, 400);
    const models = fs.readFileSync(session.path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as { message?: { role?: string; provider?: string; model?: string } }).filter((entry) => entry.message?.role === 'assistant').map((entry) => `${entry.message?.provider}/${entry.message?.model}`);
    rows.push({ task, ...seen, usage, models: [...new Set(models)], answer });
    write(`live-${SCRIPT_TOOL}.json`, rows);
  }
});

// ── Overrides and branches (task 7.1) ────────────────────────────────────────

test('an override written on one branch and read from a sibling branch', async () => {
  test.skip(MODE !== 'branch');
  test.setTimeout(180_000);
  const session = await newStubSession();
  const reopen = async () => {
    await page.evaluate((id) => window.sero.agent.close(id), session.id);
    await page.evaluate(async ({ id, file, ws, provider, model }) => {
      await window.sero.agent.open(id, file, ws);
      await window.sero.agent.setModel(id, provider, model);
    }, { id: session.id, file: session.path, ws: workspaceId, provider: STUB_PROVIDER_ID, model: STUB_MODEL_ID });
  };
  const rows: Record<string, unknown> = {};
  await turn(session.id, 'write:one');
  const second = await turn(session.id, 'write:two');
  // The override entry is a child of turn two, so it is on turn two's branch only.
  await page.evaluate(({ id, prompt, tool }) => window.sero.agent.setContextOverrides(id, { systemPrompt: prompt, disabledTools: [tool] }), { id: session.id, prompt: OVERRIDE_PROMPT, tool: DISABLED_TOOL });
  if (!second.turnUndo) throw new Error('No undo point for turn two.');
  await page.evaluate(({ id, ref }) => window.sero.agent.undoToTurn(id, ref), { id: session.id, ref: second.turnUndo });
  rows.siblingBeforeReopen = (await snapshot(session.id)).overrides;
  const before = stub.requests.length;
  await turn(session.id, 'on the sibling branch');
  rows.siblingRequestMessages = stub.requests[before]?.messages.map((message) => `${message.role}: ${message.text.slice(0, 30)}`);
  await reopen();
  rows.siblingAfterReopen = (await snapshot(session.id)).overrides;
  rows.siblingRequestHasOverride = stub.requests[before]?.system.includes('POC_OVERRIDE_MARK') ?? null;
  rows.siblingRequestHasDisabledTool = stub.requests[before]?.tools.some((tool) => tool.name === DISABLED_TOOL) ?? null;

  // Reload and resume keep a choice made on the current branch.
  await page.evaluate(({ id, tool }) => window.sero.agent.setContextOverrides(id, { disabledTools: [tool] }), { id: session.id, tool: DISABLED_TOOL });
  await page.evaluate((id) => window.sero.agent.reloadResources(id), session.id);
  rows.afterReload = (await snapshot(session.id)).overrides;
  await reopen();
  rows.afterResume = (await snapshot(session.id)).overrides;
  // An undo with no later message, then a reopen: which branch does the session open on?
  const third = await turn(session.id, 'write:three');
  if (third.turnUndo) {
    const undone = await page.evaluate(({ id, ref }) => window.sero.agent.undoToTurn(id, ref), { id: session.id, ref: third.turnUndo });
    await page.evaluate((id) => window.sero.agent.close(id), session.id);
    const reopened = await page.evaluate(({ id, file, ws }) => window.sero.agent.open(id, file, ws), { id: session.id, file: session.path, ws: workspaceId });
    rows.undoThenReopen = { messagesAfterUndo: undone.messages.length, messagesAfterReopen: reopened.messages.length };
  }
  write(`branch-${LABEL}.json`, rows);
});

// ── A prompt change and a tool change in the middle of a session (tasks 7.2 and 7.4) ──

test('requests and session entries after a prompt edit and a tool toggle', async () => {
  test.skip(MODE !== 'promptchange');
  test.setTimeout(180_000);
  const session = await newStubSession();
  const shape = (label: string, index: number) => {
    const request = stub.requests[index];
    return { label, roles: request.roles.join(' '), systemChars: request.system.length, hasOverride: request.system.includes('POC_OVERRIDE_MARK'), tools: request.tools.length, hasGrep: request.tools.some((tool) => tool.name === DISABLED_TOOL) };
  };
  const rows: unknown[] = [];
  const step = async (label: string) => { const index = stub.requests.length; await turn(session.id, label); rows.push(shape(label, index)); };
  await step('first turn');
  await page.evaluate(({ id, prompt }) => window.sero.agent.setContextOverrides(id, { systemPrompt: prompt }), { id: session.id, prompt: OVERRIDE_PROMPT });
  await step('after the prompt edit');
  await page.evaluate(({ id, tool }) => window.sero.agent.setContextOverrides(id, { disabledTools: [tool] }), { id: session.id, tool: DISABLED_TOOL });
  await step('after the prompt reset and the tool toggle');
  await page.evaluate((id) => window.sero.agent.setContextOverrides(id, null), session.id);
  await step('after the tool is back');
  const entries = fs.readFileSync(session.path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as { type: string; customType?: string; data?: unknown; message?: { role?: string; content?: unknown; sections?: Record<string, unknown>; toolsAdded?: Array<{ name: string }>; toolsRemoved?: Array<{ name: string }> } });
  const file = entries.map((entry) => {
    if (entry.type === 'custom') return `custom ${entry.customType} ${JSON.stringify(entry.data).slice(0, 90)}`;
    if (entry.type !== 'message') return entry.type;
    const message = entry.message ?? {};
    if (message.role !== 'system') return `message ${message.role}`;
    return `message system contentChars=${JSON.stringify(message.content ?? '').length} sections=[${Object.keys(message.sections ?? {}).join(',')}] toolsAdded=${message.toolsAdded?.length ?? 0} toolsRemoved=[${(message.toolsRemoved ?? []).map((tool) => tool.name).join(',')}] added=[${(message.toolsAdded ?? []).length < 4 ? (message.toolsAdded ?? []).map((tool) => tool.name).join(',') : '...'}]`;
  });
  write(`promptchange-${process.env.POC_MIDCONVO === '1' ? 'in-place' : 'folded'}.json`, { requests: rows, file });
});
