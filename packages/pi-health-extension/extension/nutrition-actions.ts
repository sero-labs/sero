/**
 * Nutrition-related tool action handlers: log_food, inventory.
 */

import type { HealthState, NutritionEntry, FoodItem, InventoryItem } from '../shared/types';
import { todayISO, generateId } from '../shared/types';
import { readState, writeState } from './state-io';

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  details: Record<string, unknown>;
}

interface LogFoodParams {
  description?: string;
  meal?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  date?: string;
  items?: string;
}

/** Log a food entry via NLP or manual values. */
export async function handleLogFood(
  statePath: string,
  params: LogFoodParams,
): Promise<ToolResult> {
  if (!params.description) {
    return { content: [{ type: 'text', text: 'Error: description is required for log_food' }], details: {} };
  }

  const state = await readState(statePath);
  const id = generateId(state.nextId);

  // Parse items from JSON string if provided
  let items: FoodItem[] = [];
  if (params.items) {
    try {
      items = JSON.parse(params.items);
    } catch {
      // Items parsing failed, leave empty
    }
  }

  const entry: NutritionEntry = {
    id,
    date: params.date || todayISO(),
    meal: (params.meal as NutritionEntry['meal']) || 'snack',
    description: params.description,
    calories: params.calories || 0,
    protein: params.protein || 0,
    carbs: params.carbs || 0,
    fat: params.fat || 0,
    items,
    source: 'nlp',
    confirmed: params.calories !== undefined,
    createdAt: new Date().toISOString(),
  };

  state.nutritionLog.push(entry);
  state.nextId++;
  await writeState(statePath, state);

  const macroStr = `${entry.calories} cal | P:${entry.protein}g C:${entry.carbs}g F:${entry.fat}g`;
  return {
    content: [{ type: 'text', text: `Logged ${entry.meal}: "${entry.description}" (${macroStr})` }],
    details: {},
  };
}

interface InventoryParams {
  inventory_action?: string;
  name?: string;
  category?: string;
  quantity?: string;
  item_id?: string;
}

/** CRUD for pantry/fridge inventory. */
export async function handleInventory(
  statePath: string,
  params: InventoryParams,
): Promise<ToolResult> {
  const state = await readState(statePath);
  const subAction = params.inventory_action || 'list';

  switch (subAction) {
    case 'list': {
      if (state.inventory.length === 0) {
        return { content: [{ type: 'text', text: 'Inventory is empty. Add items to track your pantry!' }], details: {} };
      }
      const lines = state.inventory.map(
        (item) => `- ${item.name} (${item.category})${item.quantity ? ` — ${item.quantity}` : ''}`,
      );
      return { content: [{ type: 'text', text: `Inventory (${state.inventory.length} items):\n${lines.join('\n')}` }], details: {} };
    }

    case 'add': {
      if (!params.name) {
        return { content: [{ type: 'text', text: 'Error: name required for inventory add' }], details: {} };
      }
      const item: InventoryItem = {
        id: generateId(state.nextId),
        name: params.name,
        category: (params.category as InventoryItem['category']) || 'other',
        quantity: params.quantity,
        updatedAt: new Date().toISOString(),
      };
      state.inventory.push(item);
      state.nextId++;
      await writeState(statePath, state);
      return { content: [{ type: 'text', text: `Added "${item.name}" to inventory` }], details: {} };
    }

    case 'remove': {
      if (!params.item_id) {
        return { content: [{ type: 'text', text: 'Error: item_id required for inventory remove' }], details: {} };
      }
      const before = state.inventory.length;
      state.inventory = state.inventory.filter((i) => i.id !== params.item_id);
      if (state.inventory.length === before) {
        return { content: [{ type: 'text', text: `Item ${params.item_id} not found` }], details: {} };
      }
      await writeState(statePath, state);
      return { content: [{ type: 'text', text: `Removed item from inventory` }], details: {} };
    }

    default:
      return { content: [{ type: 'text', text: `Unknown inventory action: ${subAction}` }], details: {} };
  }
}

/** Get today's nutrition totals. */
export function getDailyNutritionTotals(state: HealthState, date?: string): {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  meals: number;
} {
  const targetDate = date || todayISO();
  const todayEntries = state.nutritionLog.filter((e) => e.date === targetDate);
  return {
    calories: todayEntries.reduce((sum, e) => sum + e.calories, 0),
    protein: todayEntries.reduce((sum, e) => sum + e.protein, 0),
    carbs: todayEntries.reduce((sum, e) => sum + e.carbs, 0),
    fat: todayEntries.reduce((sum, e) => sum + e.fat, 0),
    meals: todayEntries.length,
  };
}
