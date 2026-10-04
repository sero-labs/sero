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
    runtime: 'host',
    // A stub run must never reach a paid provider, whatever model a session falls back to.
    withoutEnv: getLlmCredentialEnvKeys(),
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
  const result = await turn(created.id, 'runcode: read the readme');
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
