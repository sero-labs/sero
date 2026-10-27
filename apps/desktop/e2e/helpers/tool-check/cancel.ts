/**
 * Cancellation (spec `session-tool-surface`, "Cancelling a tool call stops
 * it"). At each site the stub model starts a shell loop that touches a
 * heartbeat file in the workspace; at a Code Mode site the loop is a nested
 * `bash` call inside a script. The turn is cancelled the way a user would
 * cancel it there, and the check passes when the turn ends, the heartbeat
 * stops and the session takes the next prompt. The workspace is shared with a
 * container, so the heartbeat works on every runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import { assistantTextFromEvents, promptAndCollectEvents } from '../agent';
import type { StubRequest } from '../stub-model';
import type { ToolCheckApp } from './app';
import { cliCommandFor } from './command-line';
import { firstUserText } from './driver';
import { CANCELS } from './ledger';
import { openChat } from './sites';
import type { ToolCheckSite } from './types';
import { PLANNER, planningReply, STEP, TRIGGER } from './workflow-worker';


/** The Code Mode sites run the loop inside a script. */
const SCRIPT_SITES: ReadonlySet<ToolCheckSite> = new Set(['codemode-chat', 'codemode-subagent']);

let cancels = 0;

function lastUserText(request: StubRequest): string {
  return [...request.messages].reverse().find((message) => message.role === 'user')?.text ?? '';
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function until(what: string, ready: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!ready()) {
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`);
    await sleep(200);
  }
}

export function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`${what} within ${ms} ms`)), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** A shell loop that touches a file five times a second, and the checks that it started and stopped. */
export class Heartbeat {
  readonly file: string;

  constructor(n: number, private readonly folder: string) {
    this.file = `.tc-cancel-${n}.beat`;
  }

  /** The loop stops by itself after five minutes, so a cancel that fails cannot leave it running for good. */
  get command(): string {
    return `for i in $(seq 1 1500); do touch ${this.file}; sleep 0.2; done`;
  }

  private get path(): string {
    return path.join(this.folder, this.file);
  }

  started(): Promise<void> {
    return until(`the long command to start (${this.file})`, () => fs.existsSync(this.path), 60_000);
  }

  /** Two seconds without a touch means the loop stopped. */
  async stopped(): Promise<void> {
    await sleep(1_000);
    const before = fs.statSync(this.path).mtimeMs;
    await sleep(2_000);
    const after = fs.statSync(this.path).mtimeMs;
    fs.rmSync(this.path, { force: true });
    if (after !== before) throw new Error('the long command was still running after the cancel');
  }
}

/** The number that keeps each cancellation's names apart. */
export function nextCancel(): number {
  return ++cancels;
}

/** One cancellation: names, the long call, and the heartbeat it writes. */
class Case {
  readonly n = nextCancel();
  readonly script: boolean;
  readonly goal: string;
  readonly next: string;
  readonly ready: string;
  readonly beat: Heartbeat;

  constructor(readonly check: ToolCheckApp, readonly site: ToolCheckSite) {
    this.script = SCRIPT_SITES.has(site);
    this.goal = `tc-cancel ${site} ${this.n}`;
    this.next = `tc-cancel next ${site} ${this.n}`;
    this.ready = `tc-cancel ready ${this.n}`;
    this.beat = new Heartbeat(this.n, check.workspaceDir);
  }

  longCall(): { id: string; name: string; arguments: Record<string, unknown> } {
    const id = `tc-cancel-call-${this.n}`;
    const command = this.beat.command;
    if (!this.script) return { id, name: 'bash', arguments: { command } };
    const code = `await tools.bash({ command: ${JSON.stringify(command)} });\ntext('tc-cancel: the script went on');`;
    return { id, name: 'codemode', arguments: { code } };
  }

  waitForBeat(): Promise<void> {
    return this.beat.started();
  }

  expectStopped(): Promise<void> {
    return this.beat.stopped();
  }

  /** The session's next prompt, answered by the stub, must complete. */
  async expectNextPrompt(sessionId: string): Promise<void> {
    const turn = await promptAndCollectEvents(this.check.page, sessionId, this.next, 60_000);
    const text = assistantTextFromEvents(turn.events);
    if (!text.includes(this.ready)) throw new Error(`the next prompt got ${JSON.stringify(text.slice(0, 200))}`);
  }

  /** A launching chat's turn: the stub answers its next prompt; a tool result after the cancel just ends it. */
  answerChat(request: StubRequest, launch: string, call: () => StubReply): StubReply | undefined {
    if (firstUserText(request) !== launch) return undefined;
    if (lastUserText(request) === this.next) return { text: this.ready };
    if (request.messages.some((message) => message.role === 'tool')) return { text: 'tc-cancel: stopped' };
    return call();
  }
}

type StubReply = { text: string } | { toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> };

/** Starts the turn and returns it with the session, without waiting for it to end. */
async function startTurn(c: Case, prompt: string): Promise<{ sessionId: string; turn: Promise<unknown> }> {
  const sessionId = await openChat(c.check);
  // A cancelled turn ends with agent_end; an `error` event ends it too, so either settles this.
  const turn = promptAndCollectEvents(c.check.page, sessionId, prompt, 600_000).catch((error: unknown) => error);
  return { sessionId, turn };
}

async function cancelChat(c: Case): Promise<void> {
  const remove = c.check.respondWith((request) => c.answerChat(request, c.goal, () => ({ toolCalls: [c.longCall()] })));
  try {
    const { sessionId, turn } = await startTurn(c, c.goal);
    await c.waitForBeat();
    // The chat's Stop button.
    await c.check.page.evaluate((id) => window.sero.agent.abort(id), sessionId);
    await within(turn, 30_000, 'the turn did not end after the cancel');
    await c.expectStopped();
    await c.expectNextPrompt(sessionId);
  } finally {
    remove();
  }
}

async function cancelSubagent(c: Case): Promise<void> {
  const launch = `launch ${c.goal}`;
  const launchCallId = `tc-cancel-launch-${c.n}`;
  const remove = c.check.respondWith((request) => {
    const first = firstUserText(request);
    if (first !== launch && first.includes(c.goal)) return { toolCalls: [c.longCall()] };
    return c.answerChat(request, launch, () => ({
      toolCalls: [{ id: launchCallId, name: 'subagent', arguments: { systemPrompt: 'You run tool checks.', task: c.goal } }],
    }));
  });
  try {
    const { sessionId, turn } = await startTurn(c, launch);
    await c.waitForBeat();
    // The subagent's own stop, as the subagent list in the chat offers it.
    const stopped = await c.check.page.evaluate(async ({ workspaceId, callId }) => {
      const entry = (await window.sero.subagent.snapshot(workspaceId)).find((candidate: { id: string; toolCallId?: string }) => candidate.toolCallId === callId);
      if (entry) await window.sero.subagent.abort(entry.id);
      return Boolean(entry);
    }, { workspaceId: c.check.workspaceId, callId: launchCallId });
    if (!stopped) throw new Error('the running subagent is not in the subagent list');
    await within(turn, 30_000, 'the launching turn did not end after the subagent was stopped');
    await c.expectStopped();
    await c.expectNextPrompt(sessionId);
  } finally {
    remove();
  }
}

/** The loop the launching chat created, by its prompt. */
function loopIdFor(c: Case): string | undefined {
  const dir = path.join(c.check.workspaceDir, '.sero', 'apps', 'orchestrator');
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as { loops: Array<{ id: string }> };
  return index.loops.map((loop) => loop.id).find((id) => {
    const loop = JSON.parse(fs.readFileSync(path.join(dir, 'loops', id, 'loop.json'), 'utf8')) as { prompt: string };
    return loop.prompt === c.goal;
  });
}

async function orchestrator(c: Case, params: Record<string, unknown>): Promise<{ text: string; isError?: boolean }> {
  return c.check.page.evaluate(
    ({ id, args }) => window.sero.appAgent.invokeTool('orchestrator', id, 'orchestrator', args),
    { id: c.check.workspaceId, args: params },
  );
}

async function cancelWorkflowWorker(c: Case): Promise<void> {
  const launch = `launch ${c.goal}`;
  let stepSessions = 0;
  const done = JSON.stringify({ status: 'succeeded', summary: 'ran after the cancel', completion: { status: 'complete', reason: 'ran after the cancel' } });
  const remove = c.check.respondWith((request) => {
    const first = firstUserText(request);
    if (first !== launch && first.includes(c.goal)) {
      if (request.system.includes(PLANNER)) return { text: planningReply(c.goal, 'bash', true) };
      if (request.system.includes(TRIGGER)) return { text: JSON.stringify({ recurring: false, schedule: null, events: [] }) };
      if (!request.system.includes(STEP)) return undefined;
      // The first step session runs the long command; the run after the cancel finishes at once.
      if (!request.messages.some((message) => message.role === 'tool')) stepSessions += 1;
      return stepSessions === 1 ? { toolCalls: [c.longCall()] } : { text: `Done.\n\`\`\`json\n${done}\n\`\`\`` };
    }
    return c.answerChat(request, launch, () => ({
      toolCalls: [{
        id: `tc-cancel-launch-${c.n}`,
        name: 'sero-cli',
        arguments: { command: cliCommandFor('orchestrator', { action: 'create', prompt: c.goal, useManagedWorktree: false, allowDirtyWorkspaceRoot: true, activate: true }) },
      }],
    }));
  });
  try {
    const { turn } = await startTurn(c, launch);
    await c.waitForBeat();
    const loopId = loopIdFor(c);
    if (!loopId) throw new Error('the running loop is not in the orchestrator index');
    // Disabling a Workflow stops its running step.
    const disabled = await orchestrator(c, { action: 'disable', loopId });
    if (disabled.isError) throw new Error(`disable failed: ${disabled.text}`);
    await within(turn, 30_000, 'the launching turn did not end after the Workflow was disabled');
    await c.expectStopped();
    // Enabling the Workflow starts its next run, which is the worker's next prompt.
    const enabled = await orchestrator(c, { action: 'enable', loopId });
    if (enabled.isError) throw new Error(`enable failed: ${enabled.text}`);
    await until('the run after the cancel to complete', () => {
      const loop = JSON.parse(fs.readFileSync(path.join(c.check.workspaceDir, '.sero', 'apps', 'orchestrator', 'loops', loopId, 'loop.json'), 'utf8')) as {
        runtime: { completion?: { status: string } };
      };
      return loop.runtime.completion?.status === 'complete';
    }, 120_000);
  } finally {
    remove();
  }
}

/** Runs the cancellation check at a site and records it. */
export async function checkCancel(check: ToolCheckApp, site: ToolCheckSite): Promise<string | undefined> {
  const c = new Case(check, site);
  const started = Date.now();
  const run = site === 'chat' || site === 'codemode-chat' ? cancelChat
    : site === 'subagent' || site === 'codemode-subagent' ? cancelSubagent
      : site === 'workflow-worker' ? cancelWorkflowWorker
        : undefined;
  if (!run) throw new Error(`no cancellation check for the ${site} site yet`);
  const failure = await run(c).then(() => undefined, (error: unknown) => (error instanceof Error ? error.message : String(error)));
  check.ledger.record({ site, tool: c.script ? 'codemode' : 'bash', action: CANCELS, result: failure ? 'fail' : 'pass', ms: Date.now() - started, ...(failure ? { error: failure } : {}) });
  return failure;
}
