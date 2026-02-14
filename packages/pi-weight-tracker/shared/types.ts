/**
 * Shared state shape for the Weight Tracker app.
 *
 * This is the single source of truth — both the Pi extension and the
 * Sero web UI read/write a JSON file matching this shape.
 */

export interface WeightEntry {
  id: number;
  weight: number; // in kg (or user's preferred unit)
  date: string; // ISO date string (YYYY-MM-DD)
  note?: string; // optional note for this entry
  createdAt: string; // ISO datetime string
}

export type WeightUnit = 'kg' | 'lbs' | 'st';

export interface WeightGoal {
  target: number; // target weight
  startWeight: number; // weight when goal was set
  startDate: string; // ISO date string
}

export interface WeightTrackerState {
  entries: WeightEntry[];
  nextId: number;
  unit: WeightUnit;
  goal: WeightGoal | null;
}

export const DEFAULT_STATE: WeightTrackerState = {
  entries: [],
  nextId: 1,
  unit: 'kg',
  goal: null,
};
