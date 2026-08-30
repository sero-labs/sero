/**
 * The three tools that stop a goal.
 *
 * Stopping is an explicit tool call, never silence. Complete, blocked and
 * waiting are three separate tools because they are three different outcomes,
 * and a single tool with a status argument makes "I am done" the cheapest thing
 * to say.
 *
 * Every call carries the current goal id. A call from a goal that was replaced
 * or cleared is refused instead of quietly ending the goal that took its place.
 */

import { Type } from 'typebox';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { resolveGoalCaller, toolFailure, toolResult, type ToolResult } from './goal-session';

const GoalIdParam = Type.String({ description: 'The goal id from the goal contract in this conversation' });

export const GoalCompleteParams = Type.Object({
  goal_id: GoalIdParam,
  evidence: Type.String({
    description:
      'What proves each criterion is met — the commands you ran and their result, the files you changed, the checks that passed. A restatement of the objective is not evidence',
  }),
});

export const GoalBlockedParams = Type.Object({
  goal_id: GoalIdParam,
  reason: Type.String({ description: 'What stops you, and what you need from the user to go on' }),
  evidence: Type.Optional(Type.String({ description: 'What you tried, so the user does not repeat it' })),
});

export const GoalWaitParams = Type.Object({
  goal_id: GoalIdParam,
  reason: Type.String({ description: 'What you are waiting for, in one line' }),
  minutes: Type.Optional(
    Type.Number({ description: 'Optional backstop: wake the goal after this many minutes if nothing else does' }),
  ),
});

interface TerminalParams {
  goal_id: string;
  evidence?: string;
  reason?: string;
  minutes?: number;
}

export async function executeGoalComplete(params: TerminalParams, ctx: ExtensionContext | undefined): Promise<ToolResult> {
  const caller = resolveGoalCaller(ctx);
  if ('error' in caller) return toolFailure(caller.error);
  return toolResult(await caller.runtime.reportComplete(params.goal_id, caller.sessionPath, params.evidence ?? ''));
}

export async function executeGoalBlocked(params: TerminalParams, ctx: ExtensionContext | undefined): Promise<ToolResult> {
  const caller = resolveGoalCaller(ctx);
  if ('error' in caller) return toolFailure(caller.error);
  return toolResult(
    await caller.runtime.reportBlocked(params.goal_id, caller.sessionPath, params.reason ?? '', params.evidence),
  );
}

export async function executeGoalWait(params: TerminalParams, ctx: ExtensionContext | undefined): Promise<ToolResult> {
  const caller = resolveGoalCaller(ctx);
  if ('error' in caller) return toolFailure(caller.error);
  const untilMs = params.minutes === undefined ? undefined : Math.max(1, Math.round(params.minutes)) * 60_000;
  return toolResult(await caller.runtime.reportWait(params.goal_id, caller.sessionPath, params.reason ?? '', untilMs));
}

export function registerGoalTerminalTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'goal_complete',
    label: 'Goal complete',
    description:
      'Report that every criterion in the goal contract is met. Give the evidence for each one. Use this only when the work is done, not when you have run out of ideas.',
    parameters: GoalCompleteParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeGoalComplete(params as TerminalParams, ctx);
    },
  });

  pi.registerTool({
    name: 'goal_blocked',
    label: 'Goal blocked',
    description:
      'Report that you cannot go further on the goal without the user. Say what stops you and what you need. The goal stops and the user is told.',
    parameters: GoalBlockedParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeGoalBlocked(params as TerminalParams, ctx);
    },
  });

  pi.registerTool({
    name: 'goal_wait',
    label: 'Goal wait',
    description:
      'Park the goal until something observable happens, such as a check finishing or a process exiting. Say what you wait for. Do not use this to sleep between attempts.',
    parameters: GoalWaitParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeGoalWait(params as TerminalParams, ctx);
    },
  });
}
