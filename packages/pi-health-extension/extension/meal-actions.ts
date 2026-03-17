/**
 * Meal planning action handlers: generate_recipe, parse_menu, grocery_list.
 * These return structured prompts that guide the agent to use its
 * knowledge + user context for intelligent meal planning.
 */

import type { HealthState } from '../shared/types';
import { todayISO } from '../shared/types';
import { readState } from './state-io';
import { getDailyNutritionTotals } from './nutrition-actions';

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  details: Record<string, unknown>;
}

interface RecipeParams {
  preferences?: string;
  meal_type?: string;
  max_time?: number;
}

/** Generate a recipe based on current context, inventory, and remaining macros. */
export async function handleGenerateRecipe(
  statePath: string,
  params: RecipeParams,
): Promise<ToolResult> {
  const state = await readState(statePath);
  const ctx = state.userContext;
  const today = todayISO();
  const nutrition = getDailyNutritionTotals(state, today);

  const remaining = {
    calories: Math.max(0, ctx.dailyCalorieTarget - nutrition.calories),
    protein: Math.max(0, ctx.dailyMacros.protein - nutrition.protein),
    carbs: Math.max(0, ctx.dailyMacros.carbs - nutrition.carbs),
    fat: Math.max(0, ctx.dailyMacros.fat - nutrition.fat),
  };

  const inventoryItems = state.inventory.map((i) => i.name).join(', ');

  const lines = [
    'Generate a recipe with these constraints:',
    '',
    `Remaining macros today: ${remaining.calories} cal | P:${remaining.protein}g C:${remaining.carbs}g F:${remaining.fat}g`,
    ctx.preferences.dietType ? `Diet: ${ctx.preferences.dietType}` : '',
    ctx.preferences.allergies.length > 0 ? `Allergies: ${ctx.preferences.allergies.join(', ')}` : '',
    ctx.preferences.dislikedFoods.length > 0 ? `Avoid: ${ctx.preferences.dislikedFoods.join(', ')}` : '',
    inventoryItems ? `Available ingredients: ${inventoryItems}` : 'No inventory tracked',
    params.meal_type ? `Meal type: ${params.meal_type}` : '',
    params.max_time ? `Max prep time: ${params.max_time} minutes` : '',
    params.preferences ? `Additional preferences: ${params.preferences}` : '',
    '',
    'Please provide:',
    '1. Recipe name and description',
    '2. Complete ingredient list with quantities',
    '3. Step-by-step instructions',
    '4. Macro breakdown per serving (calories, protein, carbs, fat)',
    '5. Number of servings',
    '',
    'After presenting the recipe, ask if the user wants to log it as a meal.',
  ].filter(Boolean);

  return { content: [{ type: 'text', text: lines.join('\n') }], details: {} };
}

interface MenuParams {
  restaurant?: string;
  url?: string;
}

/** Parse a restaurant menu and recommend items fitting remaining macros. */
export async function handleParseMenu(
  statePath: string,
  params: MenuParams,
): Promise<ToolResult> {
  if (!params.restaurant && !params.url) {
    return { content: [{ type: 'text', text: 'Error: restaurant name or url required' }], details: {} };
  }

  const state = await readState(statePath);
  const ctx = state.userContext;
  const today = todayISO();
  const nutrition = getDailyNutritionTotals(state, today);

  const remaining = {
    calories: Math.max(0, ctx.dailyCalorieTarget - nutrition.calories),
    protein: Math.max(0, ctx.dailyMacros.protein - nutrition.protein),
    carbs: Math.max(0, ctx.dailyMacros.carbs - nutrition.carbs),
    fat: Math.max(0, ctx.dailyMacros.fat - nutrition.fat),
  };

  const target = params.restaurant || params.url || 'unknown restaurant';
  const lines = [
    `Search for the menu of "${target}" and recommend meals that fit these constraints:`,
    '',
    `Budget: ${remaining.calories} cal | P:${remaining.protein}g C:${remaining.carbs}g F:${remaining.fat}g`,
    ctx.preferences.dietType ? `Diet: ${ctx.preferences.dietType}` : '',
    ctx.preferences.allergies.length > 0 ? `Allergies: ${ctx.preferences.allergies.join(', ')}` : '',
    '',
    'For each recommended item, provide:',
    '- Item name and estimated macros',
    '- Why it fits the remaining budget',
    '- Any modifications to make it healthier',
    '',
    'Rank from best to worst fit. Include 3-5 options.',
  ].filter(Boolean);

  return { content: [{ type: 'text', text: lines.join('\n') }], details: {} };
}

interface GroceryParams {
  days?: number;
  preferences?: string;
}

/** Generate a grocery list based on meal plan and current inventory. */
export async function handleGroceryList(
  statePath: string,
  params: GroceryParams,
): Promise<ToolResult> {
  const state = await readState(statePath);
  const ctx = state.userContext;
  const days = params.days || 7;
  const inventoryItems = state.inventory.map((i) => `${i.name}${i.quantity ? ` (${i.quantity})` : ''}`);

  const lines = [
    `Generate a ${days}-day meal plan and shopping list with these constraints:`,
    '',
    `Daily targets: ${ctx.dailyCalorieTarget} cal | P:${ctx.dailyMacros.protein}g C:${ctx.dailyMacros.carbs}g F:${ctx.dailyMacros.fat}g`,
    `Phase: ${ctx.currentPhase}`,
    ctx.preferences.dietType ? `Diet: ${ctx.preferences.dietType}` : '',
    ctx.preferences.allergies.length > 0 ? `Allergies: ${ctx.preferences.allergies.join(', ')}` : '',
    ctx.preferences.dislikedFoods.length > 0 ? `Avoid: ${ctx.preferences.dislikedFoods.join(', ')}` : '',
    params.preferences ? `Additional: ${params.preferences}` : '',
    '',
    inventoryItems.length > 0
      ? `Already have: ${inventoryItems.join(', ')}`
      : 'No current inventory tracked.',
    '',
    'Provide:',
    '1. Day-by-day meal plan (breakfast, lunch, dinner, snacks)',
    '2. Organized shopping list by store section (produce, protein, dairy, pantry, frozen)',
    '3. Estimated total cost range',
    '4. Meal prep tips to save time',
  ].filter(Boolean);

  return { content: [{ type: 'text', text: lines.join('\n') }], details: {} };
}
