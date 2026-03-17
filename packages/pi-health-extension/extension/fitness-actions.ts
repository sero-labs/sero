/**
 * Fitness-related tool action handlers: log_workout, log_weight.
 */

import type { HealthState, WorkoutEntry, Exercise, BodyMetric } from '../shared/types';
import { todayISO, generateId } from '../shared/types';
import { readState, writeState } from './state-io';

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  details: Record<string, unknown>;
}

interface LogWorkoutParams {
  description?: string;
  type?: string;
  name?: string;
  duration?: number;
  exercises?: string;
  date?: string;
  notes?: string;
}

/** Log a workout entry. */
export async function handleLogWorkout(
  statePath: string,
  params: LogWorkoutParams,
): Promise<ToolResult> {
  if (!params.description && !params.name) {
    return { content: [{ type: 'text', text: 'Error: description or name required for log_workout' }], details: {} };
  }

  const state = await readState(statePath);
  const id = generateId(state.nextId);

  let exercises: Exercise[] = [];
  if (params.exercises) {
    try {
      exercises = JSON.parse(params.exercises);
    } catch {
      // exercises parsing failed
    }
  }

  const entry: WorkoutEntry = {
    id,
    date: params.date || todayISO(),
    type: (params.type as WorkoutEntry['type']) || 'other',
    name: params.name || params.description || 'Workout',
    duration: params.duration || 0,
    exercises,
    notes: params.notes,
    source: 'nlp',
    createdAt: new Date().toISOString(),
  };

  state.workoutLog.push(entry);
  state.nextId++;
  await writeState(statePath, state);

  const durationStr = entry.duration > 0 ? ` (${entry.duration}min)` : '';
  return {
    content: [{ type: 'text', text: `Logged workout: "${entry.name}"${durationStr} — ${entry.type}` }],
    details: {},
  };
}

interface LogWeightParams {
  weight?: number;
  body_fat?: number;
  date?: string;
  measurements?: string;
}

/** Log body weight and/or measurements. */
export async function handleLogWeight(
  statePath: string,
  params: LogWeightParams,
): Promise<ToolResult> {
  if (params.weight === undefined && params.body_fat === undefined) {
    return { content: [{ type: 'text', text: 'Error: weight or body_fat required' }], details: {} };
  }

  const state = await readState(statePath);
  const id = generateId(state.nextId);

  let measurements: Record<string, number> | undefined;
  if (params.measurements) {
    try {
      measurements = JSON.parse(params.measurements);
    } catch {
      // measurements parsing failed
    }
  }

  const metric: BodyMetric = {
    id,
    date: params.date || todayISO(),
    weight: params.weight,
    bodyFat: params.body_fat,
    measurements,
    createdAt: new Date().toISOString(),
  };

  state.bodyMetrics.push(metric);
  state.nextId++;
  await writeState(statePath, state);

  const parts: string[] = [];
  if (metric.weight !== undefined) parts.push(`${metric.weight} kg`);
  if (metric.bodyFat !== undefined) parts.push(`${metric.bodyFat}% body fat`);
  return {
    content: [{ type: 'text', text: `Logged body metrics: ${parts.join(', ')} on ${metric.date}` }],
    details: {},
  };
}

/** Get latest body metric with weight. */
export function getLatestWeight(state: HealthState): BodyMetric | undefined {
  return [...state.bodyMetrics]
    .filter((m) => m.weight !== undefined)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

/** Get today's workouts. */
export function getTodayWorkouts(state: HealthState, date?: string): WorkoutEntry[] {
  const targetDate = date || todayISO();
  return state.workoutLog.filter((w) => w.date === targetDate);
}
