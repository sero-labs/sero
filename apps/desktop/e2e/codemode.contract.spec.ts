/**
 * The calls a `codemode` script makes, shown in the chat card (spec
 * `programmatic-tool-calling`).
 *
 * The stub model serves every turn, so the spec needs no API key and spends
 * nothing. A chat turn runs a script with one working call and one failed call;
 * the rows must arrive while the script runs and survive a reopen. A subagent
 * turn runs a script that waits, and a cancel of the run must stop it.
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
import type { AgentStreamEvent, ChatHistoryPage, ChatToolCallMessage, SubagentEvent, SubagentToolActivity } from '../src/types/ipc';

/** The task text that marks the subagent session, and the prompt that starts it. */
const CANCEL_TASK = 'probe-codemode-cancel';
const SCRIPT_PROMPT = 'script: nested calls';
const CANCEL_PROMPT = 'cancel: start the probe subagent';
/** The file the waiting script keeps appending to, in the workspace. */
const TICKS_FILE = 'probe-ticks.txt';

/** A script with one working call, then one that fails. */
const NESTED_SCRIPT = [
  "await tools.bash({ command: 'echo first' });",
  "await tools.read({ path: 'probe-missing-file.txt' });",
  "return 'done';",
].join('\n');

/**
 * A script that keeps appending to a file, so a file that stops growing proves
 * the script stopped. The absolute path keeps the workspace root out of it.
 */
function tickingScript(): string {
  const target = path.join(workspaceDir, TICKS_FILE);
  return [
    'let n = 0;',
    'while (true) {',
    `  await tools.bash({ command: \`echo \${n} >> '${target}'\` });`,
    '  n += 1;',
    '}',
    "return 'never reached';",
  ].join('\n');
}

function respond(request: StubRequest): StubReply {
  const last = request.messages.at(-1);
  if (last?.role === 'tool') return { text: 'script finished' };
  const text = last?.text ?? '';
  if (text.includes(CANCEL_TASK)) {
    return { toolCalls: [{ id: 'call_waiting_script', name: 'codemode', arguments: { code: tickingScript() } }] };
  }
  if (text.startsWith('script:')) {
    return { toolCalls: [{ id: 'call_nested_script', name: 'codemode', arguments: { code: NESTED_SCRIPT } }] };
  }
  if (text.startsWith('cancel:')) {
    return {
      toolCalls: [{
        id: 'call_subagent',
        name: 'subagent',
        arguments: {
          task: CANCEL_TASK,
          systemPrompt: 'Run the script you are given.',
          model: `${STUB_PROVIDER_ID}/${STUB_MODEL_ID}`,
        },
      }],
    };
  }
  return { text: 'ok' };
}

let app: ElectronApplication;
let page: Page;
let home: TempSeroHome;
let stub: StubModelServer;
let workspaceDir = '';
let workspaceId = '';

interface NestedCall { toolName: string; isError: boolean; output: string | null }

interface ScriptTurn {
  /** True when a nested call started before its parent script ended. */
  nestedWhileRunning: boolean;
  nestedCalls: NestedCall[];
  /** The nested tool-end that arrived before the script's own end. */
  failedNested: NestedCall | undefined;
}

/** Sends a prompt and reports the nested calls as the renderer received them. */
async function scriptTurn(sessionId: string, prompt: string): Promise<ScriptTurn> {
  return page.evaluate(({ id, text }) => new Promise<ScriptTurn>((resolve, reject) => {
    const names = new Map<string, string>();
    const endedParents = new Set<string>();
    const nestedCalls: NestedCall[] = [];
    let nestedWhileRunning = false;
    let failedNested: NestedCall | undefined;
    const timer = window.setTimeout(() => {
      off();
      reject(new Error('the script turn did not end'));
    }, 90_000);
    const off = window.sero.agent.onEvent((event: AgentStreamEvent) => {
      if (event.sessionId !== id) return;
      if (event.type === 'tool_start') {
        names.set(event.tool.toolCallId, event.tool.toolName);
        if (event.tool.parentToolCallId && !endedParents.has(event.tool.parentToolCallId)) {
          nestedWhileRunning = true;
        }
      }
      if (event.type === 'tool_end') {
        if (!event.parentToolCallId) {
          endedParents.add(event.toolCallId);
        } else {
          const call = {
            toolName: names.get(event.toolCallId) ?? 'unknown',
            isError: event.isError,
            output: event.output,
          };
          nestedCalls.push(call);
          if (call.isError && !failedNested) failedNested = call;
        }
      }
      if (event.type === 'agent_end') {
        window.clearTimeout(timer);
        window.setTimeout(() => {
          off();
          resolve({ nestedWhileRunning, nestedCalls, failedNested });
        }, 1_200);
      }
    });
    window.sero.agent.prompt(id, text, undefined, `codemode-${Date.now()}`).catch(reject);
  }), { id: sessionId, text: prompt });
}

async function newSession(): Promise<{ id: string; path: string }> {
  return page.evaluate(async ({ id, provider, model }) => {
    const session = await window.sero.sessions.create(id);
    await window.sero.agent.open(session.id, session.path, id);
    await window.sero.agent.setModel(session.id, provider, model);
    return { id: session.id, path: session.path };
  }, { id: workspaceId, provider: STUB_PROVIDER_ID, model: STUB_MODEL_ID });
}

/** Close the session and open it again, so the card is rebuilt from the saved record. */
async function reopen(session: { id: string; path: string }): Promise<ChatHistoryPage> {
  await page.evaluate((id) => window.sero.agent.close(id), session.id);
  return page.evaluate(
    ({ id, file, ws }) => window.sero.agent.open(id, file, ws),
    { id: session.id, file: session.path, ws: workspaceId },
  );
}

test.beforeAll(async () => {
  stub = await startStubModel(respond);
  home = createTempSeroHome();
  workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-codemode-'));
  fs.writeFileSync(path.join(workspaceDir, 'README.md'), 'codemode\n');
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
  const workspace = await page.evaluate(
    ({ folder }) => window.sero.workspace.addFolder(folder, 'Code Mode'),
    { folder: workspaceDir },
  );
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

test('a script shows each nested call as a row while it runs', async () => {
  const session = await newSession();

  const turn = await scriptTurn(session.id, SCRIPT_PROMPT);

  expect(turn.nestedWhileRunning).toBe(true);
  expect(turn.nestedCalls.map((call) => call.toolName)).toEqual(['bash', 'read']);
  expect(turn.nestedCalls[0]?.isError).toBe(false);
  expect(turn.failedNested?.toolName).toBe('read');
  expect(turn.failedNested?.output).toContain('probe-missing-file.txt');
});

test('a reopened session shows a row for each nested call with its final state', async () => {
  const session = await newSession();
  await scriptTurn(session.id, SCRIPT_PROMPT);

  const history = await reopen(session);
  const script = history.messages.find(
    (message): message is ChatToolCallMessage => message.type === 'tool' && message.toolName === 'codemode',
  );
  if (!script) throw new Error('the reopened session has no codemode card');

  expect(script.nested?.map((call) => [call.toolName, call.state])).toEqual([
    ['bash', 'completed'],
    ['read', 'error'],
  ]);
});

test('a cancel of a subagent stops its running script', async () => {
  test.setTimeout(180_000);
  const session = await newSession();

  // The listener registers before the prompt, so the run's activity is watched from its first event.
  const run = await page.evaluate(({ chatId, text }) => new Promise<{ sawWaitingCall: boolean; status: string }>((resolve, reject) => {
    let aborted = false;
    let sawWaitingCall = false;
    const timer = window.setTimeout(() => {
      off();
      reject(new Error('the subagent run did not end'));
    }, 120_000);
    const off = window.sero.subagent.onEvent((event: SubagentEvent) => {
      if (event.type === 'subagent_start') {
        // Live activity reaches this window only while it watches the run.
        void window.sero.subagent.watch(event.entry.id);
      }
      if (event.type === 'subagent_tool_activity') {
        if (!sawWaitingCall && event.activity.some((entry: SubagentToolActivity) => entry.toolName === 'bash' && entry.running)) {
          sawWaitingCall = true;
          if (!aborted) {
            aborted = true;
            // Let the script land a few writes, so a stopped file proves stopping, not a race.
            window.setTimeout(() => {
              void window.sero.subagent.abort(event.id);
            }, 1_500);
          }
        }
      }
      if (event.type === 'subagent_end') {
        window.clearTimeout(timer);
        window.setTimeout(() => {
          off();
          resolve({ sawWaitingCall, status: event.status });
        }, 800);
      }
    });
    window.sero.agent.prompt(chatId, text, undefined, `codemode-cancel-${Date.now()}`).catch((error: unknown) => {
      window.clearTimeout(timer);
      off();
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  }), { chatId: session.id, text: CANCEL_PROMPT });

  expect(run.sawWaitingCall).toBe(true);
  expect(run.status).not.toBe('completed');

  // The script appends to a file on every nested call. Once it stops growing, the
  // script itself is stopped, not merely the run's own limit.
  const ticks = path.join(workspaceDir, TICKS_FILE);
  const readTicks = (): number => (fs.existsSync(ticks)
    ? fs.readFileSync(ticks, 'utf8').split('\n').filter(Boolean).length
    : 0);
  await page.waitForTimeout(2_000);
  const settled = readTicks();
  expect(settled).toBeGreaterThan(0);
  await page.waitForTimeout(3_000);
  expect(readTicks()).toBe(settled);
});
