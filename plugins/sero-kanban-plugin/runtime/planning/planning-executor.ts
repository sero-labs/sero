/**
 * PlanningExecutor — runs the planning phase subagents for a kanban card.
 *
 * Uses a single planner session for both existing and greenfield projects.
 * The planner inspects the codebase directly when needed and returns a
 * structured subtask breakdown for the card.
 */

import type { Card } from '../core/types';
import type { PlanningProgressTracker } from './planning-progress';
import {
  buildPlanningPrompt,
  buildSubtaskGenerationPrompt,
  parsePlanResult,
} from '../prompts';
import type { PlanGenerationOptions } from '../prompts';
import {
  createPlanningSubmissionTool,
  type PlanningSubmission,
} from './planning-submission-tool';
import { bridgeSubagentLiveOutput } from '../implementation/live-output-bridge';
import type { KanbanRuntimeHost } from '../types';

export interface PlanningExecutorDeps {
  host: Pick<KanbanRuntimeHost, 'subagents'>;
  workspaceId: string;
  planOptions?: PlanGenerationOptions;
}

/**
 * Run the full planning pipeline.
 *
 * @param greenfield — true if the workspace had no git repo / no commits.
 *   Tells the planner to build from scratch instead of inspecting an existing repo.
 */
export async function executePlanning(
  deps: PlanningExecutorDeps,
  card: Card,
  tracker: PlanningProgressTracker,
  greenfield = false,
): Promise<{ plan: string; subtasks: Card['subtasks'] }> {
  const { host, workspaceId } = deps;
  const parentSessionId = `kanban-card-${card.id}`;
  const detachLiveOutput = bridgeSubagentLiveOutput(
    host,
    workspaceId,
    parentSessionId,
    tracker,
  );

  try {
    const planningContext = greenfield
      ? buildGreenfieldContext(card)
      : buildExistingProjectContext(card);
    tracker.setPhase(greenfield ? 'Planning new project' : 'Inspecting codebase and drafting plan');
    tracker.addAgent('planner');
    await tracker.flush();

    let submittedPlan: PlanningSubmission | null = null;
    const planResult = await host.subagents.runStructured({
      agent: 'planner',
      task: buildSubtaskGenerationPrompt(card, planningContext, deps.planOptions),
      parentSessionId,
      workspaceId,
      isolated: true,
      customTools: [
        createPlanningSubmissionTool({
          submitPlan: async (submission) => {
            const outcome = submittedPlan ? 'updated' : 'recorded';
            submittedPlan = submission;
            return outcome;
          },
        }),
      ],
      onUpdate: (text) => tracker.addLogLine(text),
    });
    if (planResult.error) {
      tracker.completeAgent('planner', 'failed');
      await tracker.flush();
      throw new Error(`Planner failed: ${planResult.error}`);
    }

    tracker.completeAgent('planner');
    await tracker.flush();

    const parsed = submittedPlan ?? parsePlanResult(planResult.response);
    if (parsed.warnings.length > 0) {
      console.warn(`[planning-executor] Plan warnings: ${parsed.warnings.join('; ')}`);
    }
    return { plan: parsed.plan, subtasks: parsed.subtasks };
  } finally {
    detachLiveOutput();
  }
}

function buildExistingProjectContext(card: Card): string {
  return [
    '## Existing Project',
    '',
    'This card is being planned in a single planner pass.',
    'Inspect the current codebase yourself before finalising the plan.',
    'Use the available tools to identify relevant files, existing patterns,',
    'integration points, tests, and likely implementation risks.',
    '',
    'Focus your own reconnaissance on:',
    '- Files and modules most likely to change',
    '- Existing implementation patterns worth following',
    '- Config, build, and test files that may need updates',
    '- Dependencies and integration points that constrain the design',
    '',
    'Then produce one cohesive implementation plan and subtask breakdown.',
    '',
    '## Card Summary',
    buildPlanningPrompt(card).trim(),
  ].join('\n');
}

function buildGreenfieldContext(card: Card): string {
  const lines = [
    '## Greenfield Project',
    '',
    'This is a NEW project — the workspace is empty (no existing code).',
    'You are building from scratch. Your plan should include project',
    'scaffolding, dependency installation, and configuration as the',
    'first subtask(s) before any feature implementation.',
    '',
    'Consider:',
    '- Project initialisation (package.json, tsconfig, etc.)',
    '- Framework/library installation',
    '- Directory structure setup',
    '- Configuration files',
    '- Then feature implementation',
    '- Testing setup and tests',
  ];

  if (card.acceptance.length > 0) {
    lines.push('', '## Acceptance Criteria');
    for (const ac of card.acceptance) {
      lines.push(`- ${ac}`);
    }
  }

  return lines.join('\n');
}
