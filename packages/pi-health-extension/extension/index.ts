/**
 * Health & Fitness Extension — agentic health tracker with NLP logging,
 * cascading goals, nutrition/workout tracking, meal planning, workout
 * generation, insights, and gamification.
 *
 * Tools (LLM-callable): health (20 actions)
 * Commands (user): /health
 */

import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import { todayISO } from '../shared/types';
import { resolveStatePath, readState } from './state-io';
import { handleLogFood, getDailyNutritionTotals, handleInventory } from './nutrition-actions';
import { handleLogWorkout, handleLogWeight, getLatestWeight, getTodayWorkouts } from './fitness-actions';
import { handleSetGoal, handleAddMilestone, handleListGoals, handleUpdateContext } from './goal-actions';
import { handleGenerateRecipe, handleParseMenu, handleGroceryList } from './meal-actions';
import { handleGenerateWorkout, handleReviewProgress, handleSyncHealth } from './workout-actions';
import { handleAnalyzeTrends, handleCheckCompliance, handleCompleteGoal, handleLookback, handleUpdateStreak } from './insights-actions';

// ── All actions ────────────────────────────────────────────────

const ALL_ACTIONS = [
  // Core (Phase 1)
  'status', 'log_food', 'log_workout', 'log_weight',
  'set_goal', 'add_milestone', 'list_goals', 'update_context', 'inventory',
  // Meal planning (Phase 4)
  'generate_recipe', 'parse_menu', 'grocery_list',
  // Fitness generation (Phase 5)
  'generate_workout', 'review_progress', 'sync_health',
  // Insights & gamification (Phase 6-7)
  'analyze_trends', 'check_compliance', 'complete_goal', 'lookback', 'update_streak',
] as const;

// ── Tool parameters ────────────────────────────────────────────

const Params = Type.Object({
  action: StringEnum([...ALL_ACTIONS]),
  // Shared
  date: Type.Optional(Type.String({ description: 'Date YYYY-MM-DD (defaults to today)' })),
  description: Type.Optional(Type.String({ description: 'Natural language description' })),
  // Nutrition
  meal: Type.Optional(StringEnum(['breakfast', 'lunch', 'dinner', 'snack'] as const)),
  calories: Type.Optional(Type.Number({ description: 'Calorie count' })),
  protein: Type.Optional(Type.Number({ description: 'Protein in grams' })),
  carbs: Type.Optional(Type.Number({ description: 'Carbs in grams' })),
  fat: Type.Optional(Type.Number({ description: 'Fat in grams' })),
  items: Type.Optional(Type.String({ description: 'JSON array of FoodItem objects' })),
  // Fitness
  workout_type: Type.Optional(StringEnum(['strength', 'cardio', 'flexibility', 'sport', 'other'] as const)),
  name: Type.Optional(Type.String({ description: 'Name (workout, item, exercise, restaurant)' })),
  duration: Type.Optional(Type.Number({ description: 'Duration in minutes' })),
  exercises: Type.Optional(Type.String({ description: 'JSON array of Exercise objects' })),
  notes: Type.Optional(Type.String({ description: 'Optional notes' })),
  // Body metrics
  weight: Type.Optional(Type.Number({ description: 'Body weight in kg' })),
  body_fat: Type.Optional(Type.Number({ description: 'Body fat percentage' })),
  measurements: Type.Optional(Type.String({ description: 'JSON object of measurements in cm' })),
  // Goals
  title: Type.Optional(Type.String({ description: 'Goal or milestone title' })),
  metric: Type.Optional(Type.String({ description: 'Metric to track (weight, body_fat, etc.)' })),
  target_value: Type.Optional(Type.Number({ description: 'Target value' })),
  start_value: Type.Optional(Type.Number({ description: 'Starting value' })),
  unit: Type.Optional(Type.String({ description: 'Unit for metric' })),
  parent_goal_id: Type.Optional(Type.String({ description: 'Parent goal ID for milestones' })),
  goal_id: Type.Optional(Type.String({ description: 'Goal ID' })),
  milestone_id: Type.Optional(Type.String({ description: 'Milestone ID' })),
  deadline: Type.Optional(Type.String({ description: 'Deadline YYYY-MM-DD' })),
  // Context
  phase: Type.Optional(Type.String({ description: 'Phase: cutting, bulking, maintenance' })),
  calorie_target: Type.Optional(Type.Number({ description: 'Daily calorie target' })),
  equipment: Type.Optional(Type.String({ description: 'Comma-separated equipment' })),
  injuries: Type.Optional(Type.String({ description: 'Comma-separated injuries' })),
  diet_type: Type.Optional(Type.String({ description: 'Diet: omnivore, vegetarian, vegan, keto' })),
  allergies: Type.Optional(Type.String({ description: 'Comma-separated allergies' })),
  sleep_status: Type.Optional(Type.String({ description: 'Sleep: well-rested, tired, sleep-deprived' })),
  // Inventory
  inventory_action: Type.Optional(StringEnum(['list', 'add', 'remove'] as const)),
  category: Type.Optional(Type.String({ description: 'Food category' })),
  quantity: Type.Optional(Type.String({ description: 'Quantity (e.g. "500g")' })),
  item_id: Type.Optional(Type.String({ description: 'Item ID' })),
  // Meal planning
  meal_type: Type.Optional(Type.String({ description: 'Meal type for recipe' })),
  max_time: Type.Optional(Type.Number({ description: 'Max prep time in minutes' })),
  preferences: Type.Optional(Type.String({ description: 'Additional preferences' })),
  restaurant: Type.Optional(Type.String({ description: 'Restaurant name' })),
  url: Type.Optional(Type.String({ description: 'URL to parse' })),
  days: Type.Optional(Type.Number({ description: 'Number of days for plans' })),
  // Workout generation
  time_available: Type.Optional(Type.Number({ description: 'Time available in minutes' })),
  focus: Type.Optional(Type.String({ description: 'Workout focus area' })),
  exercise_name: Type.Optional(Type.String({ description: 'Exercise name for progress review' })),
  // Health sync
  sleep_hours: Type.Optional(Type.Number({ description: 'Hours of sleep' })),
  hrv: Type.Optional(Type.Number({ description: 'Heart rate variability (ms)' })),
  resting_hr: Type.Optional(Type.Number({ description: 'Resting heart rate (bpm)' })),
  steps: Type.Optional(Type.Number({ description: 'Step count' })),
  active_calories: Type.Optional(Type.Number({ description: 'Active calories burned' })),
  // Insights
  period_days: Type.Optional(Type.Number({ description: 'Analysis period in days' })),
});

// ── Extension ──────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let statePath = '';

  pi.on('session_start', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });
  pi.on('session_switch', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });

  pi.registerTool({
    name: 'health',
    label: 'Health & Fitness',
    description: buildToolDescription(),
    parameters: Params,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const resolvedPath = ctx ? resolveStatePath(ctx.cwd) : statePath;
      if (!resolvedPath) {
        return { content: [{ type: 'text', text: 'Error: no workspace cwd set' }], details: {} };
      }
      statePath = resolvedPath;
      return routeAction(statePath, params);
    },

    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('health '));
      text += theme.fg('muted', args.action);
      if (args.description) text += ` ${theme.fg('dim', `"${args.description}"`)}`;
      if (args.name) text += ` ${theme.fg('accent', args.name)}`;
      if (args.title) text += ` ${theme.fg('accent', args.title)}`;
      if (args.weight !== undefined) text += ` ${theme.fg('accent', `${args.weight}kg`)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const text = result.content[0];
      const msg = text?.type === 'text' ? text.text : '';
      if (msg.startsWith('Error:')) return new Text(theme.fg('error', msg), 0, 0);
      return new Text(theme.fg('success', '✓ ') + theme.fg('muted', msg), 0, 0);
    },
  });

  pi.registerCommand('health', {
    description: 'Show health & fitness status (or pass instructions inline)',
    handler: async (args, _ctx) => {
      const instruction = args.trim();
      if (instruction) {
        pi.sendUserMessage(`Using the health tool: ${instruction}`);
      } else {
        pi.sendUserMessage('Show my health and fitness status using the health tool.');
      }
    },
  });
}

// ── Action router ─────────────────────────────────────────────

async function routeAction(statePath: string, params: Record<string, unknown>) {
  switch (params.action) {
    case 'status': return handleStatus(statePath);
    case 'log_food': return handleLogFood(statePath, params);
    case 'log_workout':
      return handleLogWorkout(statePath, {
        description: params.description as string | undefined,
        type: params.workout_type as string | undefined,
        name: params.name as string | undefined,
        duration: params.duration as number | undefined,
        exercises: params.exercises as string | undefined,
        date: params.date as string | undefined,
        notes: params.notes as string | undefined,
      });
    case 'log_weight': return handleLogWeight(statePath, params);
    case 'set_goal': return handleSetGoal(statePath, params);
    case 'add_milestone': return handleAddMilestone(statePath, params);
    case 'list_goals': return handleListGoals(statePath);
    case 'update_context': return handleUpdateContext(statePath, params);
    case 'inventory': return handleInventory(statePath, params);
    case 'generate_recipe': return handleGenerateRecipe(statePath, params);
    case 'parse_menu': return handleParseMenu(statePath, params);
    case 'grocery_list': return handleGroceryList(statePath, params);
    case 'generate_workout': return handleGenerateWorkout(statePath, params);
    case 'review_progress': return handleReviewProgress(statePath, params);
    case 'sync_health': return handleSyncHealth(statePath, params);
    case 'analyze_trends': return handleAnalyzeTrends(statePath, params);
    case 'check_compliance': return handleCheckCompliance(statePath);
    case 'complete_goal': return handleCompleteGoal(statePath, params);
    case 'lookback': return handleLookback(statePath, params);
    case 'update_streak': return handleUpdateStreak(statePath);
    default:
      return { content: [{ type: 'text', text: `Unknown action: ${params.action}` }], details: {} };
  }
}

// ── Status handler ────────────────────────────────────────────

async function handleStatus(statePath: string) {
  const state = await readState(statePath);
  const ctx = state.userContext;
  const today = todayISO();

  const nutrition = getDailyNutritionTotals(state, today);
  const workouts = getTodayWorkouts(state, today);
  const latestWeight = getLatestWeight(state);

  const calR = ctx.dailyCalorieTarget - nutrition.calories;
  const pR = ctx.dailyMacros.protein - nutrition.protein;
  const cR = ctx.dailyMacros.carbs - nutrition.carbs;
  const fR = ctx.dailyMacros.fat - nutrition.fat;

  const lines: string[] = [
    `=== Health Status (${today}) ===`,
    `Phase: ${ctx.currentPhase} | Streak: ${ctx.streak} days | Level: ${ctx.personalityLevel}`,
    '',
    '--- Nutrition ---',
    `Calories: ${nutrition.calories}/${ctx.dailyCalorieTarget} (${calR} left)`,
    `Protein: ${nutrition.protein}g/${ctx.dailyMacros.protein}g (${pR}g left)`,
    `Carbs: ${nutrition.carbs}g/${ctx.dailyMacros.carbs}g (${cR}g left)`,
    `Fat: ${nutrition.fat}g/${ctx.dailyMacros.fat}g (${fR}g left)`,
    `Meals: ${nutrition.meals}`,
  ];

  if (workouts.length > 0) {
    lines.push('', '--- Workouts ---');
    for (const w of workouts) lines.push(`• ${w.name} (${w.type}, ${w.duration}min)`);
  } else {
    lines.push('', 'No workouts logged today');
  }

  if (latestWeight?.weight !== undefined) {
    lines.push('', `Weight: ${latestWeight.weight} kg (${latestWeight.date})`);
  }

  const activeGoals = state.longTermGoals.filter((g) => g.status === 'active');
  if (activeGoals.length > 0) {
    lines.push('', '--- Goals ---');
    for (const g of activeGoals) {
      const ms = state.mediumTermGoals.filter((m) => m.parentGoalId === g.id);
      const done = ms.filter((m) => m.status === 'completed').length;
      lines.push(`• ${g.title} (${done}/${ms.length} milestones)`);
    }
  }

  if (state.achievements.length > 0) {
    const recent = state.achievements.slice(-3);
    lines.push('', '--- Recent Achievements ---');
    for (const a of recent) lines.push(`🏅 ${a.title}`);
  }

  return { content: [{ type: 'text', text: lines.join('\n') }], details: {} };
}

// ── Tool description builder ──────────────────────────────────

function buildToolDescription(): string {
  return [
    'Agentic health & fitness tracker. Actions:',
    '- status: Daily summary',
    '- log_food: Log nutrition (description, meal, calories, protein, carbs, fat, items)',
    '- log_workout: Log workout (description, workout_type, name, duration, exercises)',
    '- log_weight: Body metrics (weight kg, body_fat, measurements)',
    '- set_goal: Long-term goal (title, metric, target_value, start_value, unit)',
    '- add_milestone: Milestone (parent_goal_id, title, target_value, deadline)',
    '- list_goals: Goal tree',
    '- update_context: Preferences (phase, calorie_target, protein, carbs, fat, equipment, injuries, diet_type, allergies, sleep_status)',
    '- inventory: Pantry (inventory_action: list/add/remove)',
    '- generate_recipe: AI recipe (meal_type, max_time, preferences)',
    '- parse_menu: Restaurant analysis (restaurant or url)',
    '- grocery_list: Shopping list (days, preferences)',
    '- generate_workout: AI workout (time_available, focus, workout_type)',
    '- review_progress: Exercise history (exercise_name, period_days)',
    '- sync_health: Health data (sleep_hours, hrv, resting_hr, steps, active_calories)',
    '- analyze_trends: Trend analysis (period_days, metric)',
    '- check_compliance: Daily target check',
    '- complete_goal: Mark done (goal_id or milestone_id)',
    '- lookback: Narrative journey summary (goal_id)',
    '- update_streak: Refresh streak count',
  ].join('\n');
}
