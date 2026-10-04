/**
 * What a chat session keeps across a reopen, a fork and a cancel. The stub model
 * serves every turn, so the spec needs no API key and spends nothing.
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
import type { AgentSettlement, AgentStreamEvent, ChatTurnUndoRef } from '../src/types/ipc';

let app: ElectronApplication;
let page: Page;
let home: TempSeroHome;
let stub: StubModelServer;
let workspaceDir = '';
let workspaceId = '';

function respond(request: StubRequest): StubReply {
  const last = request.messages.at(-1);
  if (last?.role === 'tool') return { text: 'tool finished' };
  const text = last?.text ?? '';
  const write = /write:(\w+)/.exec(text);
  if (write) return { toolCalls: [{ id: `call_${write[1]}`, name: 'write', arguments: { path: 'note.txt', content: `${write[1]}\n` } }] };
  if (text.startsWith('sleep:')) return { toolCalls: [{ id: 'call_sleep', name: 'bash', arguments: { command: 'sleep 20' } }] };
  return { text: `reply to "${text.slice(0, 40)}"` };
}

interface TurnResult { outcome: AgentSettlement | null; turnUndo: ChatTurnUndoRef | null }

/** Sends a prompt and waits for the turn to end. The undo point arrives after `agent_end`. */
async function turn(sessionId: string, text: string, abortOnTool = false): Promise<TurnResult> {
  return page.evaluate(({ id, prompt, abort }) => new Promise<TurnResult>((resolve, reject) => {
    let turnUndo: ChatTurnUndoRef | null = null;
    const fail = window.setTimeout(() => { off(); reject(new Error('The turn did not end.')); }, 60_000);
    const off = window.sero.agent.onEvent((event: AgentStreamEvent) => {
      if (event.sessionId !== id) return;
      if (event.type === 'user_turn_undo') turnUndo = event.turnUndo;
      if (event.type === 'tool_start' && abort) void window.sero.agent.abort(id);
      if (event.type === 'agent_end') {
        const outcome = event.outcome ?? null;
        window.clearTimeout(fail);
        window.setTimeout(() => { off(); resolve({ outcome, turnUndo }); }, 1_500);
      }
    });
    window.sero.agent.prompt(id, prompt, undefined, `turn-${Date.now()}`).catch(reject);
  }), { id: sessionId, prompt: text, abort: abortOnTool });
}

async function newSession(): Promise<{ id: string; path: string }> {
  return page.evaluate(async ({ id, provider, model }) => {
    const session = await window.sero.sessions.create(id);
    await window.sero.agent.open(session.id, session.path, id);
    await window.sero.agent.setModel(session.id, provider, model);
    return { id: session.id, path: session.path };
  }, { id: workspaceId, provider: STUB_PROVIDER_ID, model: STUB_MODEL_ID });
}

async function reopen(session: { id: string; path: string }): Promise<number> {
  await page.evaluate((id) => window.sero.agent.close(id), session.id);
  const history = await page.evaluate(({ id, file, ws }) => window.sero.agent.open(id, file, ws), { id: session.id, file: session.path, ws: workspaceId });
  return history.messages.length;
}

test.beforeAll(async () => {
  stub = await startStubModel(respond);
  home = createTempSeroHome();
  workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-session-continuity-'));
  fs.writeFileSync(path.join(workspaceDir, 'README.md'), 'continuity\n');
  fs.writeFileSync(path.join(workspaceDir, '.gitignore'), '.sero/\n');
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', ...args], { cwd: workspaceDir, stdio: 'ignore' });
  git('init', '-b', 'main');
  git('add', '-A');
  git('commit', '-m', 'initial');
  const profile = seedWorkflowProfile(home, { profilePath: path.join(home.path, '.sero-ui', 'profiles', 'workflow-test') });
  ({ app, page } = await launchSeroApp({
    seroHome: profile.path,
    runtime: 'host',
    // A stub run must never reach a paid provider, whatever model a session falls back to.
    withoutEnv: getLlmCredentialEnvKeys(),
    env: {
      HOME: home.path,
      USERPROFILE: home.path,
      SERO_FIXED_ROOT_OVERRIDE: path.join(home.path, '.sero-ui'),
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
    seed: (seroHome) => seedStubProvider(seroHome, stub.baseUrl),
  }));
  await waitForShell(page);
  const workspace = await page.evaluate(({ folder }) => window.sero.workspace.addFolder(folder, 'Continuity'), { folder: workspaceDir });
  workspaceId = workspace.id;
});

test.afterAll(async () => {
  try {
    if (app) await closeSeroApp(app);
  } finally {
    await stub?.close();
    home?.cleanup();
    if (workspaceDir) fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
});

test('an undone turn stays undone after the session is reopened', async () => {
  const session = await newSession();
  await turn(session.id, 'write:one');
  const second = await turn(session.id, 'write:two');
  if (!second.turnUndo) throw new Error('The second turn has no undo point.');
  const afterUndo = await page.evaluate(({ id, ref }) => window.sero.agent.undoToTurn(id, ref), { id: session.id, ref: second.turnUndo });

  expect(await reopen(session)).toBe(afterUndo.messages.length);
});

test('a cleared session stays empty and keeps its model after it is reopened', async () => {
  const session = await newSession();
  await turn(session.id, 'hello');
  await page.evaluate((id) => window.sero.agent.clearSession(id), session.id);

  expect(await reopen(session)).toBe(0);
  const state = await page.evaluate((id) => window.sero.agent.getModelState(id), session.id);
  expect(`${state?.model.provider}/${state?.model.modelId}`).toBe(`${STUB_PROVIDER_ID}/${STUB_MODEL_ID}`);
});

test('after a fork, the parent session still writes to its own file', async () => {
  const session = await newSession();
  await turn(session.id, 'before the fork');
  const fork = await page.evaluate((id) => window.sero.agent.forkSession(id), session.id);
  await turn(session.id, 'only in the parent');

  expect(fs.readFileSync(session.path, 'utf8')).toContain('only in the parent');
  expect(fs.existsSync(fork.path) ? fs.readFileSync(fork.path, 'utf8') : '').not.toContain('only in the parent');
});

test('a turn the user cancels during a tool call ends as cancelled', async () => {
  const session = await newSession();

  expect((await turn(session.id, 'sleep: run a long command', true)).outcome).toBe('cancelled');
});

test('a session with no messages keeps its model after it is reopened', async () => {
  const session = await newSession();
  await reopen(session);
  const state = await page.evaluate((id) => window.sero.agent.getModelState(id), session.id);

  expect(`${state?.model.provider}/${state?.model.modelId}`).toBe(`${STUB_PROVIDER_ID}/${STUB_MODEL_ID}`);
});
