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
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
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

function respond(request: StubRequest): StubReply {
  const last = request.messages.at(-1);
  if (last?.role === 'tool') return { text: `tool finished. ${FILLER}` };
  const text = last?.text ?? '';
  const write = /write:(\w+)/.exec(text);
  if (last?.role === 'user' && write && !text.includes('<conversation>')) {
    return { toolCalls: [{ id: `call_${write[1]}`, name: 'write', arguments: { path: 'poc.txt', content: `${write[1]}\n` } }] };
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
        JSON.stringify({ compaction: { enabled: true, keepRecentTokens: 50 } }, null, 2),
      );
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
