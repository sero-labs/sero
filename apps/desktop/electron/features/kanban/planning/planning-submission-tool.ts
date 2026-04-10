import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type, type Static } from '@sinclair/typebox';
import type { Card } from '../core/types';

const PlanSubtaskParams = Type.Object({
  id: Type.String({ minLength: 1, description: 'Stable subtask ID.' }),
  title: Type.String({ minLength: 1, description: 'Short subtask title.' }),
  description: Type.String({ description: 'What this subtask involves.' }),
  dependsOn: Type.Array(Type.String(), { description: 'IDs of prerequisite subtasks.' }),
  tddDesignation: Type.Optional(Type.Union([
    Type.Literal('tdd'),
    Type.Literal('test-after'),
    Type.Literal('no-test'),
  ])),
  filePaths: Type.Optional(Type.Array(Type.String())),
  complexity: Type.Optional(Type.Union([
    Type.Literal('low'),
    Type.Literal('medium'),
    Type.Literal('high'),
  ])),
});

const SubmitPlanParams = Type.Object({
  plan: Type.String({ minLength: 1, description: 'Overall implementation plan for the card.' }),
  subtasks: Type.Array(PlanSubtaskParams, {
    description: 'Structured planner subtasks for the card.',
  }),
});

type SubmittedPlanParams = Static<typeof SubmitPlanParams>;

export interface PlanningSubmission {
  plan: string;
  subtasks: Card['subtasks'];
  warnings: string[];
}

export interface PlanningSubmissionToolHandlers {
  submitPlan: (submission: PlanningSubmission) => Promise<'recorded' | 'updated'>;
}

function normalizePlanningSubmission(params: SubmittedPlanParams): PlanningSubmission {
  const subtasks: Card['subtasks'] = params.subtasks.map((subtask) => ({
    id: subtask.id,
    title: subtask.title,
    description: subtask.description,
    status: 'pending',
    dependsOn: subtask.dependsOn,
    tddDesignation: subtask.tddDesignation,
    filePaths: subtask.filePaths,
    complexity: subtask.complexity,
  }));

  const validIds = new Set(subtasks.map((subtask) => subtask.id));
  const warnings: string[] = [];
  for (const subtask of subtasks) {
    for (const dep of subtask.dependsOn) {
      if (!validIds.has(dep)) {
        warnings.push(`Subtask "${subtask.id}" depends on non-existent subtask "${dep}"`);
      }
    }
  }

  return {
    plan: params.plan,
    subtasks,
    warnings,
  };
}

export function createPlanningSubmissionTool(
  handlers: PlanningSubmissionToolHandlers,
): ToolDefinition {
  return {
    name: 'kanban_submit_plan',
    label: 'Kanban Submit Plan',
    description: 'Submit the structured implementation plan and subtasks for the current kanban card.',
    parameters: SubmitPlanParams,
    async execute(_toolCallId, params) {
      const submission = normalizePlanningSubmission(params as SubmittedPlanParams);
      const outcome = await handlers.submitPlan(submission);
      return {
        content: [{
          type: 'text',
          text: outcome === 'updated'
            ? 'Updated the structured kanban plan submission.'
            : 'Recorded the structured kanban plan submission.',
        }],
        details: {
          outcome,
          subtaskCount: submission.subtasks.length,
          warningCount: submission.warnings.length,
        },
      };
    },
  };
}
