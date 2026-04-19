import type { Card } from '@sero/common';

const VALID_TDD = new Set(['tdd', 'test-after', 'no-test']);
const VALID_COMPLEXITY = new Set(['low', 'medium', 'high']);

export interface PlanResult {
  plan: string;
  subtasks: Card['subtasks'];
  /** Validation warnings (non-blocking) about the plan structure */
  warnings: string[];
}

export function parsePlanResult(raw: string): PlanResult {
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/\{[\s\S]*"plan"[\s\S]*"subtasks"[\s\S]*\}/);

  if (!jsonMatch) {
    return { plan: raw.slice(0, 2000), subtasks: [], warnings: ['No JSON block found in planner output'] };
  }

  try {
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    const plan = typeof parsed.plan === 'string' ? parsed.plan : raw.slice(0, 2000);
    const subtasks: Card['subtasks'] = [];
    const warnings: string[] = [];

    if (Array.isArray(parsed.subtasks)) {
      for (const subtask of parsed.subtasks) {
        const tddDesignation = VALID_TDD.has(subtask.tddDesignation) ? subtask.tddDesignation : undefined;
        const complexity = VALID_COMPLEXITY.has(subtask.complexity) ? subtask.complexity : undefined;
        const filePaths = Array.isArray(subtask.filePaths) ? subtask.filePaths.map(String) : undefined;

        subtasks.push({
          id: String(subtask.id || subtasks.length + 1),
          title: String(subtask.title || 'Untitled subtask'),
          description: String(subtask.description || ''),
          status: 'pending',
          dependsOn: Array.isArray(subtask.dependsOn) ? subtask.dependsOn.map(String) : [],
          tddDesignation,
          filePaths,
          complexity,
        });
      }
    }

    const validIds = new Set(subtasks.map((subtask) => subtask.id));
    for (const subtask of subtasks) {
      for (const dep of subtask.dependsOn) {
        if (!validIds.has(dep)) {
          warnings.push(`Subtask "${subtask.id}" depends on non-existent subtask "${dep}"`);
        }
      }
    }

    return { plan, subtasks, warnings };
  } catch {
    return { plan: raw.slice(0, 2000), subtasks: [], warnings: ['Failed to parse planner JSON output'] };
  }
}
