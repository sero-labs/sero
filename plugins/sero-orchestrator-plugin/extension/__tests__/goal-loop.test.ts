/**
 * The in-session goal loop.
 *
 * The rules under test are the ones that decide whether the session drives
 * itself at all: a pending user message wins, an abort pauses, and a turn is
 * only charged to the goal when the goal started it. The loop is exercised
 * through the real registry so the extension-to-runtime path is covered too.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { Coordinator } from '../../runtime/coordinator';
import { GoalRuntime } from '../../runtime/goals/goal-runtime';
import { createGoalStore } from '../../runtime/goals/goal-store';
import { registerCoordinator, registerGoalRuntime } from '../../runtime/registry';
import { SessionDrivers } from '../../runtime/session-drivers';
import { createFakeHost } from '../../runtime/__tests__/fake-host';
import { GOAL_CONTINUATION_MESSAGE_TYPE, GOAL_CONTRACT_MESSAGE_TYPE } from '../../shared/goal-contract';
import { registerGoalCommands } from '../goal-commands';
import { fingerprintTurn, hiddenTerminalTools, registerGoalLoop, summarizeTurn } from '../goal-loop';
import { registerGoalTerminalTools } from '../goal-tools';

const WORKSPACE = '/work/repo';
const SESSION = '/sessions/chat-1.jsonl';

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;

interface SentMessage {
  customType: string;
  triggerTurn: boolean;
  details?: unknown;
}

type RegisteredTool = Parameters<ExtensionAPI['registerTool']>[0];
type RegisteredCommand = Parameters<ExtensionAPI['registerCommand']>[1];

interface FakePi {
  pi: ExtensionAPI;
  fire: (event: string, payload?: unknown, ctx?: ExtensionContext) => Promise<void>;
  /** Runs a registered slash command the way Pi does: it is never a prompt. */
  runCommand: (name: string, args: string) => Promise<void>;
  runTool: (name: string, params: unknown, ctx?: ExtensionContext) => Promise<void>;
  sent: SentMessage[];
}

function fakePi(): FakePi {
  const handlers = new Map<string, Handler>();
  const commands = new Map<string, RegisteredCommand>();
  const tools = new Map<string, RegisteredTool>();
  const sent: SentMessage[] = [];
  const stub = {
    on: (event: string, handler: Handler) => handlers.set(event, handler),
    sendMessage: (message: { customType: string; details?: unknown }, options?: { triggerTurn?: boolean }) => {
      sent.push({
        customType: message.customType,
        triggerTurn: options?.triggerTurn === true,
        ...(message.customType === GOAL_CONTRACT_MESSAGE_TYPE ? { details: message.details } : {}),
      });
    },
    getActiveTools: () => ['goal_complete', 'goal_blocked', 'goal_wait'],
    registerCommand: (name: string, command: RegisteredCommand) => commands.set(name, command),
    registerTool: (tool: RegisteredTool) => tools.set(tool.name, tool),
  } as Pick<
    ExtensionAPI,
    'on' | 'sendMessage' | 'getActiveTools' | 'registerCommand' | 'registerTool'
  > as ExtensionAPI;
  return {
    pi: stub,
    sent,
    fire: async (event, payload, ctx) => {
      await handlers.get(event)?.(payload, ctx ?? context());
    },
    runCommand: async (name, args) => {
      await commands.get(name)?.handler?.(args, commandContext());
    },
    runTool: async (name, params, ctx) => {
      const tool = tools.get(name);
      if (tool) await tool.execute('call-1', params, new AbortController().signal, () => {}, ctx ?? context());
    },
  };
}

function context(pending = false): ExtensionContext {
  return {
    cwd: WORKSPACE,
    hasPendingMessages: () => pending,
    sessionManager: { getSessionFile: () => SESSION },
  } as Pick<ExtensionContext, 'cwd' | 'hasPendingMessages' | 'sessionManager'> as ExtensionContext;
}

/** A slash command is handed the wider command context, not the turn context. */
function commandContext(): ExtensionCommandContext {
  return {
    cwd: WORKSPACE,
    sessionManager: { getSessionFile: () => SESSION },
  } as Pick<ExtensionCommandContext, 'cwd' | 'sessionManager'> as ExtensionCommandContext;
}

function assistantTurn(text: string, stopReason: 'stop' | 'aborted' = 'stop'): AgentMessage[] {
  return [
    {
      role: 'assistant',
      content: [{ type: 'text', text }],
      api: 'anthropic-messages',
      provider: 'anthropic',
      model: 'test',
      usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.02 } },
      stopReason,
      timestamp: 0,
    } as AgentMessage,
  ];
}

let runtime: GoalRuntime;
let drivers: SessionDrivers;

beforeEach(() => {
  const host = createFakeHost({ workspacePath: WORKSPACE });
  const files = new Map<string, unknown>();
  const store = createGoalStore(
    {
      read: async <T,>(file: string) => (files.get(file) as T) ?? null,
      write: async <T,>(file: string, data: T) => {
        files.set(file, data);
      },
    },
    '/state',
  );
  drivers = new SessionDrivers();
  runtime = new GoalRuntime(host, store, drivers);
  registerCoordinator(host.workspaceId, WORKSPACE, new Coordinator(host));
  registerGoalRuntime(host.workspaceId, runtime);
});

async function settleTurn(
  fire: (event: string, payload?: unknown, ctx?: ExtensionContext) => Promise<void>,
  text: string,
  options: { pending?: boolean; aborted?: boolean } = {},
): Promise<void> {
  await fire('agent_start');
  await fire('agent_end', { messages: assistantTurn(text, options.aborted ? 'aborted' : 'stop') });
  await fire('agent_settled', undefined, context(options.pending === true));
}

describe('the settled-boundary continuation', () => {
  it('continues the session when a goal is active and nothing is queued', async () => {
    const { pi, fire, sent } = fakePi();
    registerGoalLoop(pi);
    await runtime.start({ sessionPath: SESSION, objective: 'finish the migration', criteria: [] });

    await settleTurn(fire, 'I made a start.');

    expect(sent.filter((message) => message.customType === GOAL_CONTINUATION_MESSAGE_TYPE)).toEqual([
      { customType: GOAL_CONTINUATION_MESSAGE_TYPE, triggerTurn: true },
    ]);
  });

  it('cancels the continuation when the user has a message queued', async () => {
    const { pi, fire, sent } = fakePi();
    registerGoalLoop(pi);
    await runtime.start({ sessionPath: SESSION, objective: 'finish the migration', criteria: [] });

    await settleTurn(fire, 'I made a start.', { pending: true });

    expect(sent.some((message) => message.customType === GOAL_CONTINUATION_MESSAGE_TYPE)).toBe(false);
    expect((await runtime.forSession(SESSION))?.usage.automaticTurns).toBe(0);
  });

  it('charges the automatic turn the user queued a message over', async () => {
    const { pi, runCommand, fire, sent } = fakePi();
    registerGoalCommands(pi, registerGoalLoop(pi));
    // The command starts the first turn, so the turn that settles is the goal's.
    await runCommand('goal', 'finish the migration');
    sent.length = 0;

    // It runs to the end, and only then does the user queue something.
    await settleTurn(fire, 'first pass.', { pending: true });

    // The tokens were spent, so the budget pays for them. Only the next
    // continuation is suppressed.
    const goal = await runtime.forSession(SESSION);
    expect(goal?.usage.automaticTurns).toBe(1);
    expect(goal?.usage.totalTokens).toBe(15);
    expect(sent.some((message) => message.customType === GOAL_CONTINUATION_MESSAGE_TYPE)).toBe(false);
  });

  it('charges the automatic turn that was cancelled before pausing', async () => {
    const { pi, runCommand, fire } = fakePi();
    registerGoalCommands(pi, registerGoalLoop(pi));
    await runCommand('goal', 'finish the migration');

    await settleTurn(fire, 'stopping there.', { aborted: true });

    const goal = await runtime.forSession(SESSION);
    expect(goal?.status).toBe('paused');
    expect(goal?.pauseReason).toBe('abort');
    expect(goal?.usage.automaticTurns).toBe(1);
  });

  it('pauses the goal when the turn was cancelled', async () => {
    const { pi, fire, sent } = fakePi();
    registerGoalLoop(pi);
    await runtime.start({ sessionPath: SESSION, objective: 'finish the migration', criteria: [] });

    await settleTurn(fire, 'stopping there.', { aborted: true });

    const goal = await runtime.forSession(SESSION);
    expect(goal?.status).toBe('paused');
    expect(goal?.pauseReason).toBe('abort');
    expect(sent.some((message) => message.customType === GOAL_CONTINUATION_MESSAGE_TYPE)).toBe(false);
  });

  it('charges the turn it started and not the user turn that opened the goal', async () => {
    const { pi, fire } = fakePi();
    registerGoalLoop(pi);
    await runtime.start({ sessionPath: SESSION, objective: 'finish the migration', criteria: [] });

    // The user's own turn settles first: it is not the goal's.
    await settleTurn(fire, 'first pass.');
    expect((await runtime.forSession(SESSION))?.usage.automaticTurns).toBe(0);

    // The turn that continuation started is.
    await settleTurn(fire, 'second pass.');
    expect((await runtime.forSession(SESSION))?.usage.automaticTurns).toBe(1);
  });

  it('charges the automatic turn that parked the goal with a terminal tool', async () => {
    const { pi, runCommand, runTool, fire } = fakePi();
    registerGoalCommands(pi, registerGoalLoop(pi));
    registerGoalTerminalTools(pi);
    await runCommand('goal', 'finish the migration');
    const started = await runtime.forSession(SESSION);

    // The tool runs INSIDE the automatic turn, so the goal is already waiting
    // by the time that turn settles.
    await fire('agent_start');
    await runTool('goal_wait', { goal_id: started!.id, reason: 'the release build is still running' });
    await fire('agent_end', { messages: assistantTurn('parking until the build finishes.') });
    await fire('agent_settled');

    const goal = await runtime.forSession(SESSION);
    expect(goal?.status).toBe('waiting');
    // The turn is not free just because it was the last one.
    expect(goal?.usage.automaticTurns).toBe(1);
    expect(goal?.usage.totalTokens).toBe(15);
  });

  it('charges the automatic turn that reported the goal complete', async () => {
    const { pi, runCommand, runTool, fire, sent } = fakePi();
    registerGoalCommands(pi, registerGoalLoop(pi));
    registerGoalTerminalTools(pi);
    await runCommand('goal', 'finish the migration');
    const started = await runtime.forSession(SESSION);

    await fire('agent_start');
    await runTool('goal_complete', { goal_id: started!.id, evidence: 'the suite passes' });
    await fire('agent_end', { messages: assistantTurn('every criterion is met.') });
    await fire('agent_settled');

    // A completed goal is no longer live, so the record comes from the list.
    const recorded = (await runtime.list()).find((entry) => entry.id === started!.id);
    expect(recorded?.status).toBe('complete');
    expect(recorded?.usage.automaticTurns).toBe(1);
    expect(recorded?.usage.totalTokens).toBe(15);
    const finalContract = sent.findLast((message) => message.customType === GOAL_CONTRACT_MESSAGE_TYPE);
    expect(finalContract?.details).toMatchObject({ goal: { status: 'complete', usage: { automaticTurns: 1 } } });
  });

  it('does nothing in a session with no goal', async () => {
    const { pi, fire, sent } = fakePi();
    registerGoalLoop(pi);

    await settleTurn(fire, 'just a normal answer.');

    expect(sent).toEqual([]);
  });
});

describe('turn summarising', () => {
  it('keeps visible text, drops thinking, and notices a tool call', () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'a long private plan' },
          { type: 'text', text: 'Running the tests.' },
          { type: 'toolCall', id: 't1', name: 'bash', arguments: {} },
        ],
        api: 'anthropic-messages',
        provider: 'anthropic',
        model: 'test',
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.5 } },
        stopReason: 'toolUse',
        timestamp: 0,
      } as AgentMessage,
    ];

    const summary = summarizeTurn(messages);

    expect(summary.text).toBe('Running the tests.');
    expect(summary.toolAttempted).toBe(true);
    expect(summary.costUsd).toBe(0.5);
  });

  it('gives the same fingerprint to outcomes that differ only in volatile detail', () => {
    expect(fingerprintTurn('Still waiting, attempt 4, 12.3s elapsed')).toBe(
      fingerprintTurn('Still waiting, attempt 5, 48.9s elapsed'),
    );
    expect(fingerprintTurn('Still waiting')).not.toBe(fingerprintTurn('Finished'));
  });
});

describe('the terminal-tool requirement', () => {
  it('names the terminal tools a restrictive policy hid', () => {
    expect(hiddenTerminalTools(['goal_complete', 'goal_wait'])).toEqual(['goal_blocked']);
    expect(hiddenTerminalTools(['goal_complete', 'goal_blocked', 'goal_wait'])).toEqual([]);
  });
});

describe('starting the first turn', () => {
  /**
   * Pi consumes a slash command instead of submitting it as a prompt, so
   * nothing settles after `/goal`. Without a kickoff the goal is active on
   * paper and the session sits idle.
   */
  it('drives a turn when the slash command starts a goal in an idle session', async () => {
    const { pi, runCommand, sent, fire } = fakePi();
    registerGoalCommands(pi, registerGoalLoop(pi));

    await runCommand('goal', 'finish the migration');

    expect(sent.map((message) => [message.customType, message.triggerTurn])).toEqual([
      [GOAL_CONTRACT_MESSAGE_TYPE, false],
      [GOAL_CONTINUATION_MESSAGE_TYPE, true],
    ]);

    // The kickoff is the goal's own turn, so the goal pays for it.
    await settleTurn(fire, 'first pass.');
    expect((await runtime.forSession(SESSION))?.usage.automaticTurns).toBe(1);
  });

  it('drives a turn when the slash command resumes a paused goal', async () => {
    const { pi, runCommand, sent } = fakePi();
    registerGoalCommands(pi, registerGoalLoop(pi));
    const started = await runtime.start({ sessionPath: SESSION, objective: 'finish the migration', criteria: [] });
    await runtime.pause(started.goal!.id, 'user', 'the user paused the goal');
    sent.length = 0;

    await runCommand('goal', 'resume');

    expect(sent.some((message) => message.customType === GOAL_CONTINUATION_MESSAGE_TYPE && message.triggerTurn)).toBe(true);
  });

  it('does not drive a turn for a command that only reports', async () => {
    const { pi, runCommand, sent } = fakePi();
    registerGoalCommands(pi, registerGoalLoop(pi));
    await runtime.start({ sessionPath: SESSION, objective: 'finish the migration', criteria: [] });
    sent.length = 0;

    await runCommand('goal', 'status');

    expect(sent.some((message) => message.triggerTurn)).toBe(false);
  });

  it('does not drive a session another driver took while Sero was closed', async () => {
    const { pi, fire, sent } = fakePi();
    registerGoalLoop(pi);
    const started = await runtime.start({ sessionPath: SESSION, objective: 'finish the migration', criteria: [] });
    // Sero restarts: the record survives, the claim it held does not.
    await runtime.reconcile();
    drivers.release('sess-1', started.goal!.id);
    // A Workflow step got the session this goal used to drive.
    drivers.claim('sess-1', { kind: 'workflow-step', ownerId: 'loop-9' });

    await fire('session_start');

    expect(sent.some((message) => message.triggerTurn)).toBe(false);
    expect((await runtime.forSession(SESSION))?.status).toBe('paused');
  });

  it('drives a turn for a goal that was still active when Sero restarted', async () => {
    const { pi, fire, sent } = fakePi();
    registerGoalLoop(pi);
    await runtime.start({ sessionPath: SESSION, objective: 'finish the migration', criteria: [] });
    // The record outlives the process; the session id from it does not.
    await runtime.reconcile();

    await fire('session_start');

    expect(sent.map((message) => [message.customType, message.triggerTurn])).toEqual([
      [GOAL_CONTRACT_MESSAGE_TYPE, false],
      [GOAL_CONTINUATION_MESSAGE_TYPE, true],
    ]);
  });

  it('leaves a restored goal that is not active alone', async () => {
    const { pi, fire, sent } = fakePi();
    registerGoalLoop(pi);
    const started = await runtime.start({ sessionPath: SESSION, objective: 'finish the migration', criteria: [] });
    await runtime.pause(started.goal!.id, 'user', 'the user paused the goal');

    await fire('session_start');

    expect(sent.some((message) => message.triggerTurn)).toBe(false);
  });
});

describe('keeping the contract true', () => {
  it('re-states the contract after compaction rewrote the conversation', async () => {
    const { pi, fire, sent } = fakePi();
    registerGoalLoop(pi);
    await runtime.start({ sessionPath: SESSION, objective: 'finish the migration', criteria: [] });

    await settleTurn(fire, 'first pass.');
    expect(sent.some((message) => message.customType === GOAL_CONTRACT_MESSAGE_TYPE)).toBe(false);

    // Compaction may take the hidden contract with it, and the next
    // continuation points back at "the goal contract above".
    await fire('session_compact');

    expect(sent.at(-1)?.customType).toBe(GOAL_CONTRACT_MESSAGE_TYPE);
  });

  it('re-states the paused contract when the turn was cancelled', async () => {
    const { pi, fire, sent } = fakePi();
    registerGoalLoop(pi);
    await runtime.start({ sessionPath: SESSION, objective: 'finish the migration', criteria: [] });

    await settleTurn(fire, 'stopping there.', { aborted: true });

    expect(sent.some((message) => message.customType === GOAL_CONTRACT_MESSAGE_TYPE)).toBe(true);
  });

  it('re-states the contract after a terminal report ends the goal', async () => {
    const { pi, runTool, sent } = fakePi();
    registerGoalLoop(pi);
    registerGoalTerminalTools(pi);
    const started = await runtime.start({ sessionPath: SESSION, objective: 'finish the migration', criteria: [] });

    await runTool('goal_complete', { goal_id: started.goal!.id, evidence: 'the suite passes' });

    expect(sent.some((message) => message.customType === GOAL_CONTRACT_MESSAGE_TYPE)).toBe(true);
    // A completed goal is no longer this session's live goal, so the record is
    // read from the workspace list.
    const recorded = (await runtime.list()).find((goal) => goal.id === started.goal!.id);
    expect(recorded?.status).toBe('complete');
  });
});
