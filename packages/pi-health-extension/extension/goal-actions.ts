/**
 * Goal-related tool action handlers: set_goal, list_goals, update_context.
 */

import type { HealthState, LongTermGoal, MediumTermGoal, UserContext } from '../shared/types';
import { todayISO, generateId } from '../shared/types';
import { readState, writeState } from './state-io';

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  details: Record<string, unknown>;
}

interface SetGoalParams {
  title?: string;
  description?: string;
  metric?: string;
  target_value?: number;
  start_value?: number;
  unit?: string;
}

/** Create a long-term goal and prompt the agent to decompose into milestones. */
export async function handleSetGoal(
  statePath: string,
  params: SetGoalParams,
): Promise<ToolResult> {
  if (!params.title) {
    return { content: [{ type: 'text', text: 'Error: title required for set_goal' }], details: {} };
  }

  const state = await readState(statePath);
  const id = generateId(state.nextId);

  const goal: LongTermGoal = {
    id,
    title: params.title,
    description: params.description || '',
    metric: params.metric || 'weight',
    targetValue: params.target_value || 0,
    startValue: params.start_value || 0,
    unit: params.unit || 'kg',
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  state.longTermGoals.push(goal);
  state.nextId++;
  await writeState(statePath, state);

  return {
    content: [{
      type: 'text',
      text: [
        `Created long-term goal: "${goal.title}"`,
        `Target: ${goal.targetValue} ${goal.unit} (from ${goal.startValue} ${goal.unit})`,
        '',
        'Now decompose this into 3-6 medium-term milestones using the health tool with action "add_milestone".',
        'Each milestone should have a realistic deadline and measurable target.',
      ].join('\n'),
    }],
    details: {},
  };
}

interface AddMilestoneParams {
  parent_goal_id?: string;
  title?: string;
  description?: string;
  target_value?: number;
  deadline?: string;
}

/** Add a medium-term milestone linked to a long-term goal. */
export async function handleAddMilestone(
  statePath: string,
  params: AddMilestoneParams,
): Promise<ToolResult> {
  if (!params.parent_goal_id || !params.title) {
    return { content: [{ type: 'text', text: 'Error: parent_goal_id and title required' }], details: {} };
  }

  const state = await readState(statePath);
  const parent = state.longTermGoals.find((g) => g.id === params.parent_goal_id);
  if (!parent) {
    return { content: [{ type: 'text', text: `Error: goal ${params.parent_goal_id} not found` }], details: {} };
  }

  const id = generateId(state.nextId);
  const milestone: MediumTermGoal = {
    id,
    parentGoalId: params.parent_goal_id,
    title: params.title,
    description: params.description || '',
    targetValue: params.target_value || 0,
    deadline: params.deadline || '',
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  state.mediumTermGoals.push(milestone);
  state.nextId++;
  await writeState(statePath, state);

  return {
    content: [{ type: 'text', text: `Added milestone: "${milestone.title}" (deadline: ${milestone.deadline || 'not set'})` }],
    details: {},
  };
}

/** List all goals in a cascading tree format. */
export async function handleListGoals(statePath: string): Promise<ToolResult> {
  const state = await readState(statePath);

  if (state.longTermGoals.length === 0) {
    return { content: [{ type: 'text', text: 'No goals set yet. Use set_goal to create your first long-term goal!' }], details: {} };
  }

  const lines: string[] = [];
  for (const goal of state.longTermGoals) {
    const statusIcon = goal.status === 'completed' ? '✅' : goal.status === 'paused' ? '⏸' : '🎯';
    lines.push(`${statusIcon} ${goal.title} (${goal.startValue} → ${goal.targetValue} ${goal.unit})`);

    const milestones = state.mediumTermGoals.filter((m) => m.parentGoalId === goal.id);
    for (const ms of milestones) {
      const msIcon = ms.status === 'completed' ? '  ✅' : ms.status === 'paused' ? '  ⏸' : '  📍';
      lines.push(`${msIcon} ${ms.title}${ms.deadline ? ` (by ${ms.deadline})` : ''}`);
    }
  }

  return { content: [{ type: 'text', text: lines.join('\n') }], details: {} };
}

interface UpdateContextParams {
  phase?: string;
  calorie_target?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  equipment?: string;
  injuries?: string;
  diet_type?: string;
  allergies?: string;
  sleep_status?: string;
}

/** Update user context / preferences. */
export async function handleUpdateContext(
  statePath: string,
  params: UpdateContextParams,
): Promise<ToolResult> {
  const state = await readState(statePath);
  const ctx = state.userContext;

  if (params.phase) ctx.currentPhase = params.phase;
  if (params.calorie_target !== undefined) ctx.dailyCalorieTarget = params.calorie_target;
  if (params.protein !== undefined) ctx.dailyMacros.protein = params.protein;
  if (params.carbs !== undefined) ctx.dailyMacros.carbs = params.carbs;
  if (params.fat !== undefined) ctx.dailyMacros.fat = params.fat;
  if (params.equipment) ctx.equipment = params.equipment.split(',').map((s) => s.trim());
  if (params.injuries) ctx.injuries = params.injuries.split(',').map((s) => s.trim());
  if (params.diet_type) ctx.preferences.dietType = params.diet_type;
  if (params.allergies) ctx.preferences.allergies = params.allergies.split(',').map((s) => s.trim());
  if (params.sleep_status) ctx.sleepStatus = params.sleep_status;

  await writeState(statePath, state);

  const summary = [
    `Phase: ${ctx.currentPhase}`,
    `Targets: ${ctx.dailyCalorieTarget} cal | P:${ctx.dailyMacros.protein}g C:${ctx.dailyMacros.carbs}g F:${ctx.dailyMacros.fat}g`,
    ctx.equipment.length > 0 ? `Equipment: ${ctx.equipment.join(', ')}` : null,
    ctx.injuries.length > 0 ? `Injuries: ${ctx.injuries.join(', ')}` : null,
    ctx.preferences.dietType ? `Diet: ${ctx.preferences.dietType}` : null,
  ].filter(Boolean).join('\n');

  return { content: [{ type: 'text', text: `Updated user context:\n${summary}` }], details: {} };
}
