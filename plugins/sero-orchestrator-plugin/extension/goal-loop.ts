/**
 * The in-session goal loop (D01: the extension drives, the runtime supervises).
 *
 * It continues from the SETTLED boundary, not from turn end. `agent_settled`
 * fires once, after queued work, provider retries and compaction have finished;
 * `turn_end` fires inside the tool loop and would start overlapping
 * continuations.
 *
 * Four rules decide whether a continuation is sent at all:
 *   - a pending user message cancels it. The user always wins.
 *   - an aborted turn pauses the goal. Escape means stop, not retry.
 *   - the runtime, not this file, decides limits and no-progress holds.
 *   - the goal must still be active when the boundary is reached.
 */

import { createHash } from 'node:crypto';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { GOAL_TERMINAL_TOOLS } from '../shared/goal-defaults';
import {
  buildGoalContinuation,
  buildGoalContract,
  GOAL_CONTINUATION_MESSAGE_TYPE,
  GOAL_CONTRACT_MESSAGE_TYPE,
  GOAL_STATUS_MESSAGE_TYPE,
} from '../shared/goal-contract';
import type { Goal, GoalVerdict } from '../shared/goal-types';
import { normalizeTurnText } from '../shared/goal-fingerprint';
import { resolveGoalCaller } from './goal-session';

/** What the settled turn produced, gathered as the turn runs. */
interface TurnRecord {
  text: string;
  toolAttempted: boolean;
  totalTokens: number;
  costUsd: number;
  aborted: boolean;
}

function emptyTurn(): TurnRecord {
  return { text: '', toolAttempted: false, totalTokens: 0, costUsd: 0, aborted: false };
}

/**
 * Visible assistant text only. Thinking is excluded because reasoning
 * differently while producing the same answer is not progress, and tool calls
 * are excluded because an attempted tool already resets the ledger on its own.
 */
export function summarizeTurn(messages: AgentMessage[]): TurnRecord {
  const record = emptyTurn();
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const part of message.content) {
      if (part.type === 'text') record.text += part.text;
      if (part.type === 'toolCall') record.toolAttempted = true;
    }
    record.totalTokens += message.usage.totalTokens;
    record.costUsd += message.usage.cost.total;
    record.aborted = message.stopReason === 'aborted';
  }
  return record;
}

export function fingerprintTurn(text: string): string {
  return createHash('sha256').update(normalizeTurnText(text)).digest('hex');
}

/** Sends the contract, which supersedes every earlier one in this conversation. */
export function assertGoalContract(pi: ExtensionAPI, goal: Goal): void {
  pi.sendMessage(
    { customType: GOAL_CONTRACT_MESSAGE_TYPE, content: buildGoalContract(goal), display: false, details: { goalId: goal.id } },
    { triggerTurn: false },
  );
}

/** One line about what the goal just did, for the transcript and the banner. */
function announce(pi: ExtensionAPI, goal: Goal, text: string): void {
  pi.sendMessage(
    { customType: GOAL_STATUS_MESSAGE_TYPE, content: text, display: true, details: { goalId: goal.id, status: goal.status } },
    { triggerTurn: false },
  );
}

function verdictText(verdict: Exclude<GoalVerdict, { kind: 'continue' }>): string {
  switch (verdict.kind) {
    case 'hold-no-progress':
      return `Goal paused — ${verdict.reason}. Resume it with /goal resume.`;
    case 'limited':
      return `Goal stopped at a limit — it ${verdict.reason}. This is not completion. Raise the limit, then resume.`;
    case 'waiting':
      return `Goal is waiting — ${verdict.reason}.`;
    case 'inactive':
      return `Goal is no longer driving this session — ${verdict.reason}.`;
  }
}

/**
 * D07: goal mode never widens what the agent may do, and it never runs without
 * a way to stop. A tool policy that hides a terminal tool makes the goal
 * unstoppable, so the goal pauses instead of the policy being widened.
 */
export function hiddenTerminalTools(activeTools: string[]): string[] {
  return GOAL_TERMINAL_TOOLS.filter((name) => !activeTools.includes(name));
}

export function registerGoalLoop(pi: ExtensionAPI): void {
  let turn = emptyTurn();
  // True while the turn now starting is one this loop asked for. Only such
  // turns are charged to the goal budget.
  let continuationQueued = false;
  let automatic = false;

  pi.on('before_agent_start', (event) => {
    // A real user prompt is never a goal continuation, whatever was queued.
    if (event.prompt.trim().length > 0) continuationQueued = false;
  });

  pi.on('agent_start', () => {
    automatic = continuationQueued;
    continuationQueued = false;
    turn = emptyTurn();
  });

  // The event fires before the tool runs, so a refused or failed tool call
  // still counts as an attempt — which is the point: the agent tried something.
  pi.on('tool_execution_start', () => {
    turn.toolAttempted = true;
  });

  pi.on('agent_end', (event) => {
    const summary = summarizeTurn(event.messages);
    turn = { ...summary, toolAttempted: turn.toolAttempted || summary.toolAttempted };
  });

  pi.on('session_start', async (_event, ctx) => {
    const caller = resolveGoalCaller(ctx);
    if ('error' in caller) return;
    const goal = await caller.runtime.reattach(caller.sessionPath);
    if (!goal) return;
    const hidden = hiddenTerminalTools(pi.getActiveTools());
    if (hidden.length > 0 && goal.status === 'active') {
      const paused = await caller.runtime.pause(
        goal.id,
        'tool-policy',
        `this session cannot call ${hidden.join(', ')}, so the goal could not be stopped`,
      );
      if (paused.goal) assertGoalContract(pi, paused.goal);
      return;
    }
    assertGoalContract(pi, goal);
  });

  pi.on('agent_settled', async (_event, ctx: ExtensionContext) => {
    const caller = resolveGoalCaller(ctx);
    if ('error' in caller) return;
    const goal = await caller.runtime.forSession(caller.sessionPath);
    if (!goal) return;

    if (turn.aborted) {
      // Escape or cancel. Pause immediately and never poke a paused goal.
      const paused = await caller.runtime.pause(goal.id, 'abort', 'the turn was cancelled');
      if (paused.goal) announce(pi, paused.goal, 'Goal paused because the turn was cancelled. Resume it with /goal resume.');
      return;
    }
    // A queued user message cancels the continuation rather than racing it.
    if (ctx.hasPendingMessages()) return;
    if (goal.status !== 'active') return;

    const verdict = await caller.runtime.checkContinue({
      goalId: goal.id,
      sessionPath: caller.sessionPath,
      fingerprint: fingerprintTurn(turn.text),
      toolAttempted: turn.toolAttempted,
      automatic,
      totalTokens: turn.totalTokens,
      costUsd: turn.costUsd,
    });

    if (verdict.kind !== 'continue') {
      if (verdict.goal) {
        assertGoalContract(pi, verdict.goal);
        announce(pi, verdict.goal, verdictText(verdict));
      }
      return;
    }

    continuationQueued = true;
    pi.sendMessage(
      {
        customType: GOAL_CONTINUATION_MESSAGE_TYPE,
        content: buildGoalContinuation(verdict.goal),
        display: true,
        details: { goalId: verdict.goal.id, automaticTurns: verdict.goal.usage.automaticTurns },
      },
      { triggerTurn: true },
    );
  });
}
