/**
 * Health & Fitness Extension — agentic health tracker with NLP logging,
 * cascading goals, nutrition/workout tracking, and contextual AI.
 *
 * Tools (LLM-callable): health (status, log_food, log_workout, log_weight,
 *   set_goal, add_milestone, list_goals, update_context, inventory)
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

// ── Tool parameters ────────────────────────────────────────────

const Params = Type.Object({
  action: StringEnum([
    'status', 'log_food', 'log_workout', 'log_weight',
    'set_goal', 'add_milestone', 'list_goals', 'update_context', 'inventory',
  ] as const),
  // Shared
  date: Type.Optional(Type.String({ description: 'Date as YYYY-MM-DD (defaults to today)' })),
  description: Type.Optional(Type.String({ description: 'Natural language description (for log_food/log_workout)' })),
  // Nutrition
  meal: Type.Optional(StringEnum(['breakfast', 'lunch', 'dinner', 'snack'] as const)),
  calories: Type.Optional(Type.Number({ description: 'Calorie count' })),
  protein: Type.Optional(Type.Number({ description: 'Protein in grams' })),
  carbs: Type.Optional(Type.Number({ description: 'Carbs in grams' })),
  fat: Type.Optional(Type.Number({ description: 'Fat in grams' })),
  items: Type.Optional(Type.String({ description: 'JSON array of FoodItem objects' })),
  // Fitness
  workout_type: Type.Optional(StringEnum(['strength', 'cardio', 'flexibility', 'sport', 'other'] as const)),
  name: Type.Optional(Type.String({ description: 'Workout or item name' })),
  duration: Type.Optional(Type.Number({ description: 'Duration in minutes' })),
  exercises: Type.Optional(Type.String({ description: 'JSON array of Exercise objects' })),
  notes: Type.Optional(Type.String({ description: 'Optional notes' })),
  // Body metrics
  weight: Type.Optional(Type.Number({ description: 'Body weight in kg' })),
  body_fat: Type.Optional(Type.Number({ description: 'Body fat percentage' })),
  measurements: Type.Optional(Type.String({ description: 'JSON object of body measurements in cm' })),
  // Goals
  title: Type.Optional(Type.String({ description: 'Goal or milestone title' })),
  metric: Type.Optional(Type.String({ description: 'What metric to track (weight, body_fat, etc.)' })),
  target_value: Type.Optional(Type.Number({ description: 'Target value for goal' })),
  start_value: Type.Optional(Type.Number({ description: 'Starting value for goal' })),
  unit: Type.Optional(Type.String({ description: 'Unit for goal metric' })),
  parent_goal_id: Type.Optional(Type.String({ description: 'Parent goal ID for milestones' })),
  deadline: Type.Optional(Type.String({ description: 'Deadline as YYYY-MM-DD' })),
  // Context
  phase: Type.Optional(Type.String({ description: 'Training phase: cutting, bulking, maintenance' })),
  calorie_target: Type.Optional(Type.Number({ description: 'Daily calorie target' })),
  equipment: Type.Optional(Type.String({ description: 'Comma-separated equipment list' })),
  injuries: Type.Optional(Type.String({ description: 'Comma-separated injury list' })),
  diet_type: Type.Optional(Type.String({ description: 'Diet type: omnivore, vegetarian, vegan, keto' })),
  allergies: Type.Optional(Type.String({ description: 'Comma-separated allergies' })),
  sleep_status: Type.Optional(Type.String({ description: 'Sleep quality: well-rested, tired, sleep-deprived' })),
  // Inventory
  inventory_action: Type.Optional(StringEnum(['list', 'add', 'remove'] as const)),
  category: Type.Optional(Type.String({ description: 'Food category for inventory' })),
  quantity: Type.Optional(Type.String({ description: 'Quantity string (e.g. "500g", "2 cans")' })),
  item_id: Type.Optional(Type.String({ description: 'Item ID for inventory remove' })),
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
    description: [
      'Agentic health & fitness tracker. Actions:',
      '- status: Daily summary (macros, workouts, goals)',
      '- log_food: Log nutrition (description, meal, calories, protein, carbs, fat, items)',
      '- log_workout: Log workout (description, workout_type, name, duration, exercises)',
      '- log_weight: Log body metrics (weight in kg, body_fat, measurements)',
      '- set_goal: Create long-term goal (title, description, metric, target_value, start_value, unit)',
      '- add_milestone: Add milestone to goal (parent_goal_id, title, target_value, deadline)',
      '- list_goals: Show goal tree',
      '- update_context: Set preferences (phase, calorie_target, protein, carbs, fat, equipment, injuries, diet_type, allergies, sleep_status)',
      '- inventory: Pantry/fridge management (inventory_action: list/add/remove, name, category, quantity, item_id)',
    ].join('\n'),
    parameters: Params,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const resolvedPath = ctx ? resolveStatePath(ctx.cwd) : statePath;
      if (!resolvedPath) {
        return { content: [{ type: 'text', text: 'Error: no workspace cwd set' }], details: {} };
      }
      statePath = resolvedPath;

      switch (params.action) {
        case 'status':
          return handleStatus(statePath);
        case 'log_food':
          return handleLogFood(statePath, params);
        case 'log_workout':
          return handleLogWorkout(statePath, {
            description: params.description,
            type: params.workout_type,
            name: params.name,
            duration: params.duration,
            exercises: params.exercises,
            date: params.date,
            notes: params.notes,
          });
        case 'log_weight':
          return handleLogWeight(statePath, params);
        case 'set_goal':
          return handleSetGoal(statePath, params);
        case 'add_milestone':
          return handleAddMilestone(statePath, params);
        case 'list_goals':
          return handleListGoals(statePath);
        case 'update_context':
          return handleUpdateContext(statePath, params);
        case 'inventory':
          return handleInventory(statePath, params);
        default:
          return { content: [{ type: 'text', text: `Unknown action: ${params.action}` }], details: {} };
      }
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
      if (msg.startsWith('Error:')) {
        return new Text(theme.fg('error', msg), 0, 0);
      }
      return new Text(theme.fg('success', '✓ ') + theme.fg('muted', msg), 0, 0);
    },
  });

  // ── Command: /health ────────────────────────────────────────

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

// ── Status handler ────────────────────────────────────────────

async function handleStatus(statePath: string) {
  const state = await readState(statePath);
  const ctx = state.userContext;
  const today = todayISO();

  const nutrition = getDailyNutritionTotals(state, today);
  const workouts = getTodayWorkouts(state, today);
  const latestWeight = getLatestWeight(state);

  const calRemaining = ctx.dailyCalorieTarget - nutrition.calories;
  const pRemaining = ctx.dailyMacros.protein - nutrition.protein;
  const cRemaining = ctx.dailyMacros.carbs - nutrition.carbs;
  const fRemaining = ctx.dailyMacros.fat - nutrition.fat;

  const lines: string[] = [
    `=== Health Status (${today}) ===`,
    '',
    `Phase: ${ctx.currentPhase} | Streak: ${ctx.streak} days`,
    '',
    '--- Nutrition ---',
    `Calories: ${nutrition.calories} / ${ctx.dailyCalorieTarget} (${calRemaining} remaining)`,
    `Protein:  ${nutrition.protein}g / ${ctx.dailyMacros.protein}g (${pRemaining}g remaining)`,
    `Carbs:    ${nutrition.carbs}g / ${ctx.dailyMacros.carbs}g (${cRemaining}g remaining)`,
    `Fat:      ${nutrition.fat}g / ${ctx.dailyMacros.fat}g (${fRemaining}g remaining)`,
    `Meals logged: ${nutrition.meals}`,
  ];

  if (workouts.length > 0) {
    lines.push('', '--- Workouts ---');
    for (const w of workouts) {
      lines.push(`• ${w.name} (${w.type}, ${w.duration}min)`);
    }
  } else {
    lines.push('', '--- Workouts ---', 'No workouts logged today');
  }

  if (latestWeight?.weight !== undefined) {
    lines.push('', `Latest weight: ${latestWeight.weight} kg (${latestWeight.date})`);
  }

  const activeGoals = state.longTermGoals.filter((g) => g.status === 'active');
  if (activeGoals.length > 0) {
    lines.push('', '--- Active Goals ---');
    for (const g of activeGoals) {
      lines.push(`• ${g.title} (${g.startValue} → ${g.targetValue} ${g.unit})`);
    }
  }

  return { content: [{ type: 'text', text: lines.join('\n') }], details: {} };
}
