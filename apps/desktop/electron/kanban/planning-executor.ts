/**
 * PlanningExecutor — runs the planning phase subagents for a kanban card.
 *
 * Two modes:
 * - **Existing project**: analyst + scout reconnaissance (parallel),
 *   then planner generates subtask breakdown.
 * - **Greenfield project**: skips reconnaissance (nothing to analyse),
 *   planner builds from card description alone.
 *
 * Extracted from orchestrator.ts for file size compliance.
 */

import type { Card } from './types';
import type { PlanningProgressTracker } from './planning-progress';
import {
  buildPlanningPrompt,
  buildSubtaskGenerationPrompt,
  PLANNER_SYSTEM_PROMPT,
  parsePlanResult,
} from './prompts';
import type { SubagentManager } from '../subagent/index';

export interface PlanningExecutorDeps {
  subagentManager: SubagentManager;
  workspaceId: string;
}

/**
 * Run the full planning pipeline.
 *
 * @param greenfield — true if the workspace had no git repo / no commits.
 *   Skips the analyst/scout phase and tells the planner to build from scratch.
 */
export async function executePlanning(
  deps: PlanningExecutorDeps,
  card: Card,
  tracker: PlanningProgressTracker,
  greenfield = false,
): Promise<{ plan: string; subtasks: Card['subtasks'] }> {
  const { subagentManager, workspaceId } = deps;
  const parentSessionId = `kanban-card-${card.id}`;
  const taskDescription = buildPlanningPrompt(card);

  let reconResult: string;

  if (greenfield) {
    // Greenfield: no codebase to analyse — provide context directly
    reconResult = buildGreenfieldContext(card);
    tracker.setPhase('Planning new project');
    tracker.addAgent('planner');
    await tracker.flush();
  } else {
    // Existing project: parallel reconnaissance
    reconResult = await runReconnaissance(
      deps, parentSessionId, taskDescription, tracker,
    );

    tracker.setPhase('Generating plan');
    tracker.addAgent('planner');
    await tracker.flush();
  }

  // Plan generation (same for both modes — prompt includes greenfield context)
  const planResult = await subagentManager.runSingle({
    task: buildSubtaskGenerationPrompt(card, reconResult),
    systemPrompt: PLANNER_SYSTEM_PROMPT,
    parentSessionId,
    workspaceId,
    isolated: true,
    onUpdate: (text) => tracker.addLogLine(text),
  });

  tracker.completeAgent('planner');
  await tracker.flush();

  return parsePlanResult(planResult);
}

// ── Reconnaissance (existing projects only) ──────────────────

async function runReconnaissance(
  deps: PlanningExecutorDeps,
  parentSessionId: string,
  taskDescription: string,
  tracker: PlanningProgressTracker,
): Promise<string> {
  const { subagentManager, workspaceId } = deps;

  tracker.setPhase('Analysing codebase');
  tracker.addAgent('analyst');
  tracker.addAgent('scout');
  await tracker.flush();

  const result = await subagentManager.runParallel({
    tasks: [
      {
        agent: 'analyst',
        task: `Analyse the codebase for this development task:\n\n${taskDescription}\n\nFocus on:\n1. Relevant files and modules\n2. Existing patterns and conventions\n3. Dependencies and integration points\n4. Potential challenges`,
      },
      {
        agent: 'scout',
        task: `Quick reconnaissance for this task:\n\n${taskDescription}\n\nFind:\n- Related files and test files\n- Similar patterns already implemented\n- Config files that may need changes`,
      },
    ],
    parentSessionId,
    workspaceId,
    isolated: true,
    onUpdate: (text) => tracker.addLogLine(text),
  });

  tracker.completeAgent('analyst');
  tracker.completeAgent('scout');

  return result;
}

// ── Greenfield Context ───────────────────────────────────────

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
