/**
 * The user's Goal surface: the bridged `goal` tool and the `/goal` command.
 *
 * `/goal` in an ordinary chat session is the primary entry point. A user never
 * has to open Orchestrator to start, pause or stop a goal; Orchestrator is the
 * management view for goals they left running.
 */

import { StringEnum } from '@earendil-works/pi-ai';
import { Type } from 'typebox';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Goal, GoalLimits, GoalOutcome } from '../shared/goal-types';
import { assertGoalContract, hiddenTerminalTools, type GoalTurnStarter } from './goal-loop';
import { resolveGoalCaller, toolFailure, toolResult, type ToolResult } from './goal-session';

export const GOAL_ACTIONS = ['start', 'status', 'pause', 'resume', 'stop', 'list', 'set_limits'] as const;

export type GoalAction = (typeof GOAL_ACTIONS)[number];

export const GoalToolParams = Type.Object({
  action: StringEnum(GOAL_ACTIONS, { description: 'Goal operation to run' }),
  objective: Type.Optional(Type.String({ description: 'For start: what the session must achieve' })),
  criteria: Type.Optional(
    Type.String({ description: 'For start: completion criteria, separated by semicolons. Each one must be checkable' }),
  ),
  goalId: Type.Optional(Type.String({ description: 'For pause/resume/stop/set_limits: the goal id (defaults to this session\'s goal)' })),
  maxTurns: Type.Optional(Type.Number({ description: 'Budget: automatic turns the goal may take (default 25)' })),
  maxMinutes: Type.Optional(Type.Number({ description: 'Budget: minutes of active time' })),
  maxTokens: Type.Optional(Type.Number({ description: 'Budget: total tokens' })),
  maxCostUsd: Type.Optional(Type.Number({ description: 'Budget: cost in USD. It bounds the goal\'s turns; it is not a hard spend cap' })),
});

export interface GoalToolParamsShape {
  action: GoalAction;
  objective?: string;
  criteria?: string;
  goalId?: string;
  maxTurns?: number;
  maxMinutes?: number;
  maxTokens?: number;
  maxCostUsd?: number;
}

const HELP = `Usage:
  /goal <objective>                     start a goal in this session
  /goal <objective> -- <criteria>       criteria separated by semicolons
  /goal status                          show this session's goal
  /goal pause | resume | stop           control it
  /goal list                            every goal in this workspace
  /goal turns <n>                       change the automatic-turn budget`;

export function parseLimits(params: GoalToolParamsShape): GoalLimits {
  const limits: GoalLimits = {};
  if (params.maxTurns !== undefined) limits.maxAttemptsTotal = params.maxTurns;
  if (params.maxMinutes !== undefined) limits.maxWallClockMs = params.maxMinutes * 60_000;
  if (params.maxTokens !== undefined) limits.maxTotalTokens = params.maxTokens;
  if (params.maxCostUsd !== undefined) limits.maxCostUsd = params.maxCostUsd;
  return limits;
}

export function parseCriteria(criteria: string | undefined): string[] {
  return (criteria ?? '').split(';').map((entry) => entry.trim()).filter(Boolean);
}

/** One compact line per goal, so `list` stays readable at any size. */
function describeGoal(goal: Goal): string {
  const cap = goal.limits.maxAttemptsTotal;
  const turns = cap === undefined ? `${goal.usage.automaticTurns} turns` : `${goal.usage.automaticTurns}/${cap} turns`;
  const status = goal.status === 'complete' ? 'reported complete' : goal.closedAt ? 'stopped' : goal.status;
  return `${goal.id} · ${status} · ${turns} · ${goal.objective}`;
}

function describeDetail(goal: Goal): string {
  const lines = [describeGoal(goal)];
  if (goal.criteria.length > 0) lines.push(`Criteria: ${goal.criteria.join('; ')}`);
  if (goal.usage.costUsd > 0) lines.push(`Cost so far: $${goal.usage.costUsd.toFixed(2)} over ${goal.usage.totalTokens} tokens.`);
  if (goal.wait) lines.push(`Waiting for: ${goal.wait.reason}. Resume it when that is met.`);
  if (goal.block) lines.push(`Blocked: ${goal.block.reason}`);
  if (goal.limitReached) lines.push(`Limit reached: ${goal.limitReached}. Reaching a limit is not completion.`);
  if (goal.reportedComplete) lines.push(`Reported complete with: ${goal.reportedComplete.evidence}`);
  return lines.join('\n');
}

/**
 * Runs one goal action for the calling session.
 *
 * `activeTools` is the session's own tool surface. Starting a goal that cannot
 * be stopped is refused rather than started and hoped about (D07).
 */
export async function executeGoalTool(
  params: GoalToolParamsShape,
  ctx: ExtensionContext | undefined,
  activeTools: () => string[],
): Promise<ToolResult> {
  // The tool surface is checked before anything else: it is the session's own,
  // and a goal that cannot be stopped must be refused for that reason and not
  // for whatever the next check would have said.
  if (params.action === 'start') {
    const hidden = hiddenTerminalTools(activeTools());
    if (hidden.length > 0) {
      return toolFailure(
        `Goal mode needs ${hidden.join(', ')} to stop a goal, and this session cannot call ${hidden.length > 1 ? 'them' : 'it'}. Goal mode grants no extra tools, so the goal is not started.`,
      );
    }
  }

  const caller = resolveGoalCaller(ctx);
  if ('error' in caller) return toolFailure(caller.error);
  const { runtime, sessionPath } = caller;

  switch (params.action) {
    case 'start':
      return toolResult(
        await runtime.start({
          sessionPath,
          objective: params.objective ?? '',
          criteria: parseCriteria(params.criteria),
          limits: parseLimits(params),
        }),
      );
    case 'status': {
      const goal = await runtime.forSession(sessionPath);
      return goal
        ? toolResult({ ok: true, text: describeDetail(goal), goal })
        : toolResult({ ok: true, text: 'This session has no goal. Start one with /goal <objective>.' });
    }
    case 'list': {
      const goals = await runtime.list();
      return toolResult({
        ok: true,
        text: goals.length === 0 ? 'No goals in this workspace.' : goals.map(describeGoal).join('\n'),
      });
    }
    case 'pause':
    case 'resume':
    case 'stop':
    case 'set_limits': {
      // Control never leaves the session that owns the goal. The runtime
      // addresses goals by id because a future management view will need that,
      // but this surface is reachable by the model, and one conversation must
      // not be able to stop, restart or re-budget another one's goal. A given
      // id is therefore a confirmation, not a target.
      const own = await runtime.forSession(sessionPath);
      if (!own) return toolFailure('This session has no goal.');
      if (params.goalId !== undefined && params.goalId !== own.id) {
        return toolFailure(
          `Goal ${params.goalId} does not belong to this session. Only ${own.id} can be controlled from here.`,
        );
      }
      const outcome: GoalOutcome =
        params.action === 'pause'
          ? await runtime.pause(own.id, 'user', 'the user paused the goal')
          : params.action === 'resume'
            ? await runtime.resume(own.id)
            : params.action === 'stop'
              ? await runtime.stop(own.id)
              : await runtime.setLimits(own.id, parseLimits(params));
      return toolResult(outcome);
    }
  }
}

/** `/goal <objective> -- <criteria>` and the short control words. */
export function parseGoalCommand(args: string): GoalToolParamsShape | { error: string } {
  const trimmed = args.trim();
  if (!trimmed) return { error: HELP };
  const [word, ...rest] = trimmed.split(/\s+/);
  const lowered = word.toLowerCase();
  if (lowered === 'status' || lowered === 'list' || lowered === 'pause' || lowered === 'resume' || lowered === 'stop') {
    return { action: lowered, goalId: rest[0] };
  }
  if (lowered === 'turns') {
    const turns = Number(rest[0]);
    if (!Number.isInteger(turns) || turns < 1) return { error: 'turns needs a whole number, for example /goal turns 40' };
    return { action: 'set_limits', maxTurns: turns };
  }
  const [objective, criteria] = trimmed.split(/\s--\s/, 2);
  return { action: 'start', objective, criteria };
}

/** Only `start` and `resume` can leave a goal active with no turn running. */
function needsKickoff(action: GoalAction): boolean {
  return action === 'start' || action === 'resume';
}

export function registerGoalCommands(pi: ExtensionAPI, startTurn: GoalTurnStarter): void {
  pi.registerTool({
    name: 'goal',
    label: 'Goal',
    description:
      'Run this session toward one objective until it is met. Actions: start, status, pause, resume, stop, list, set_limits. ' +
      'A goal keeps the session working after each turn settles, inside a turn, token, cost and time budget.',
    parameters: GoalToolParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await executeGoalTool(params as GoalToolParamsShape, ctx, () => pi.getActiveTools());
      const goal = result.details.goal as Goal | undefined;
      if (goal) assertGoalContract(pi, goal);
      // No kickoff here: this call runs inside a turn, and the loop continues
      // the goal from that turn's settled boundary.
      return result;
    },
  });

  pi.registerCommand('goal', {
    description: 'Keep this session working toward one objective: start, status, pause, resume, stop, list',
    handler: async (args, ctx) => {
      const parsed = parseGoalCommand(args ?? '');
      if ('error' in parsed) {
        ctx?.ui?.notify(parsed.error, 'error');
        return;
      }
      const result = await executeGoalTool(parsed, ctx, () => pi.getActiveTools());
      const goal = result.details.goal as Goal | undefined;
      if (goal) assertGoalContract(pi, goal);
      ctx?.ui?.notify(result.text, result.details.ok === false ? 'error' : 'info');
      // A command runs outside a turn. Pi consumes the command instead of
      // sending it as a prompt, so a goal made active here would sit idle with
      // no settled boundary to continue from: start its first turn.
      if (goal?.status === 'active' && needsKickoff(parsed.action)) startTurn(goal);
    },
  });
}
