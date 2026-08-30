/** User-authorized Goal management for the Orchestrator UI. */

import { StringEnum } from '@earendil-works/pi-ai';
import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { resolveGoalRuntimeByCwd } from '../runtime/registry';
import type { GoalRuntime } from '../runtime/goals/goal-runtime';
import type { GoalLimits, GoalOutcome } from '../shared/goal-types';
import { toolFailure, toolResult, type ToolResult } from './goal-session';

const GOAL_APP_ACTIONS = ['show', 'pause', 'resume', 'stop', 'delete', 'set_limits'] as const;
type GoalAppAction = (typeof GOAL_APP_ACTIONS)[number];

export const GoalAppParams = Type.Object({
  action: StringEnum(GOAL_APP_ACTIONS, { description: 'Goal management action' }),
  goalId: Type.String({ description: 'Goal id from the watched Goal index' }),
  maxTurns: Type.Optional(Type.Number({ description: 'Automatic-turn budget' })),
  maxMinutes: Type.Optional(Type.Number({ description: 'Active-time budget in minutes' })),
  maxTokens: Type.Optional(Type.Number({ description: 'Token budget' })),
  maxCostUsd: Type.Optional(Type.Number({ description: 'Cost budget in USD' })),
});

interface GoalAppParamsShape {
  action: GoalAppAction;
  goalId: string;
  maxTurns?: number;
  maxMinutes?: number;
  maxTokens?: number;
  maxCostUsd?: number;
}

function limitsOf(params: GoalAppParamsShape): GoalLimits {
  return {
    ...(params.maxTurns === undefined ? {} : { maxAttemptsTotal: params.maxTurns }),
    ...(params.maxMinutes === undefined ? {} : { maxWallClockMs: params.maxMinutes * 60_000 }),
    ...(params.maxTokens === undefined ? {} : { maxTotalTokens: params.maxTokens }),
    ...(params.maxCostUsd === undefined ? {} : { maxCostUsd: params.maxCostUsd }),
  };
}

export async function executeGoalApp(
  params: GoalAppParamsShape,
  cwd: string | undefined,
  resolve: (cwd: string) => GoalRuntime | undefined = resolveGoalRuntimeByCwd,
): Promise<ToolResult> {
  if (!cwd) return toolFailure('No workspace context is available for this call.');
  const runtime = resolve(cwd);
  if (!runtime) return toolFailure('Goal mode is not available in this workspace.');

  let outcome: GoalOutcome;
  switch (params.action) {
    case 'show': {
      const goal = (await runtime.list()).find((entry) => entry.id === params.goalId);
      outcome = goal
        ? { ok: true, text: `Goal ${goal.id}.`, goal }
        : { ok: false, text: `No goal ${params.goalId}.` };
      break;
    }
    case 'pause':
      outcome = await runtime.pause(params.goalId, 'user', 'the user paused the goal in Orchestrator');
      break;
    case 'resume':
      outcome = await runtime.resume(params.goalId);
      break;
    case 'stop':
      outcome = await runtime.stop(params.goalId);
      break;
    case 'delete':
      outcome = await runtime.remove(params.goalId);
      break;
    case 'set_limits':
      outcome = await runtime.setLimits(params.goalId, limitsOf(params));
      break;
  }
  return toolResult(outcome);
}

export function registerGoalAppTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'goals',
    label: 'Goals',
    description: 'Manage Goal records from the Orchestrator user interface.',
    parameters: GoalAppParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeGoalApp(params as GoalAppParamsShape, ctx?.cwd);
    },
  });
}
