/**
 * Workout generation and progressive overload action handlers.
 */

import type { HealthState, WorkoutEntry, Exercise } from '../shared/types';
import { todayISO } from '../shared/types';
import { readState } from './state-io';

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  details: Record<string, unknown>;
}

interface GenerateWorkoutParams {
  time_available?: number;
  focus?: string;
  workout_type?: string;
}

/** Generate a workout based on current constraints and progressive overload. */
export async function handleGenerateWorkout(
  statePath: string,
  params: GenerateWorkoutParams,
): Promise<ToolResult> {
  const state = await readState(statePath);
  const ctx = state.userContext;

  // Find recent workouts for progressive overload
  const recentWorkouts = getRecentWorkoutsOfType(
    state,
    params.workout_type || params.focus || '',
    14,
  );

  const overloadContext = buildOverloadContext(recentWorkouts);

  const lines = [
    'Generate a workout with these constraints:',
    '',
    params.time_available ? `Time available: ${params.time_available} minutes` : 'Time: flexible',
    `Phase: ${ctx.currentPhase}`,
    ctx.equipment.length > 0 ? `Equipment: ${ctx.equipment.join(', ')}` : 'Equipment: bodyweight only',
    ctx.injuries.length > 0 ? `Injuries/limitations: ${ctx.injuries.join(', ')}` : '',
    ctx.sleepStatus ? `Recovery status: ${ctx.sleepStatus}` : '',
    params.focus ? `Focus: ${params.focus}` : '',
    params.workout_type ? `Type: ${params.workout_type}` : '',
  ].filter(Boolean);

  if (overloadContext.length > 0) {
    lines.push(
      '',
      '--- Progressive Overload Reference (recent performance) ---',
      ...overloadContext,
      '',
      'Apply progressive overload: increase weight by 2.5-5% OR add 1-2 reps per set from the last session.',
      'If recovery is poor (tired/sleep-deprived), maintain or reduce by 10%.',
    );
  }

  lines.push(
    '',
    'Provide a complete workout with:',
    '1. Warm-up (5 min)',
    '2. Main exercises with sets, reps, and suggested weight',
    '3. Rest periods between sets',
    '4. Cool-down / stretching',
    '5. Estimated total calories burned',
    '',
    'After presenting the workout, ask if the user wants to log it when completed.',
    'Use `health log_workout` with structured exercise data.',
  );

  return { content: [{ type: 'text', text: lines.join('\n') }], details: {} };
}

interface ReviewProgressParams {
  exercise_name?: string;
  period_days?: number;
}

/** Review exercise history and suggest progressive overload. */
export async function handleReviewProgress(
  statePath: string,
  params: ReviewProgressParams,
): Promise<ToolResult> {
  const state = await readState(statePath);
  const days = params.period_days || 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const recentWorkouts = state.workoutLog.filter((w) => w.date >= cutoffStr);

  if (recentWorkouts.length === 0) {
    return { content: [{ type: 'text', text: `No workouts logged in the last ${days} days.` }], details: {} };
  }

  const lines = [`Workout progress review (last ${days} days):`, ''];

  // Aggregate exercise data
  const exerciseMap = new Map<string, Array<{ date: string; sets: Exercise['sets'] }>>();
  for (const workout of recentWorkouts) {
    for (const ex of workout.exercises) {
      const name = ex.name.toLowerCase();
      if (params.exercise_name && !name.includes(params.exercise_name.toLowerCase())) continue;
      const existing = exerciseMap.get(name) ?? [];
      existing.push({ date: workout.date, sets: ex.sets });
      exerciseMap.set(name, existing);
    }
  }

  if (exerciseMap.size === 0) {
    const searchTerm = params.exercise_name || 'any exercise';
    return { content: [{ type: 'text', text: `No data found for "${searchTerm}" in last ${days} days.` }], details: {} };
  }

  for (const [name, sessions] of exerciseMap) {
    lines.push(`**${name}** (${sessions.length} sessions):`);
    for (const session of sessions.slice(-5)) {
      if (session.sets && session.sets.length > 0) {
        const setStr = session.sets
          .map((s) => `${s.reps}x${s.weight}kg${s.rpe ? ` @RPE${s.rpe}` : ''}`)
          .join(', ');
        lines.push(`  ${session.date}: ${setStr}`);
      }
    }

    // Suggest progression
    const lastSession = sessions[sessions.length - 1];
    if (lastSession?.sets && lastSession.sets.length > 0) {
      const lastSet = lastSession.sets[0];
      const newWeight = Math.round((lastSet.weight * 1.025) * 2) / 2; // Round to 0.5
      lines.push(`  → Suggested next: ${lastSet.reps}x${newWeight}kg (+2.5%)`);
    }
    lines.push('');
  }

  lines.push(
    `Total workouts: ${recentWorkouts.length}`,
    `Workout types: ${[...new Set(recentWorkouts.map((w) => w.type))].join(', ')}`,
  );

  return { content: [{ type: 'text', text: lines.join('\n') }], details: {} };
}

interface SyncHealthParams {
  sleep_hours?: number;
  hrv?: number;
  resting_hr?: number;
  steps?: number;
  active_calories?: number;
}

/** Sync external health data (Apple Health / Google Fit / manual). */
export async function handleSyncHealth(
  statePath: string,
  params: SyncHealthParams,
): Promise<ToolResult> {
  // For now this accepts manual input; future: native API integration
  const parts: string[] = [];

  if (params.sleep_hours !== undefined) {
    parts.push(`Sleep: ${params.sleep_hours}h`);
    const sleepStatus = params.sleep_hours >= 7 ? 'well-rested'
      : params.sleep_hours >= 5 ? 'tired'
      : 'sleep-deprived';
    parts.push(`Recovery: ${sleepStatus}`);
  }
  if (params.hrv !== undefined) parts.push(`HRV: ${params.hrv}ms`);
  if (params.resting_hr !== undefined) parts.push(`Resting HR: ${params.resting_hr} bpm`);
  if (params.steps !== undefined) parts.push(`Steps: ${params.steps}`);
  if (params.active_calories !== undefined) parts.push(`Active calories: ${params.active_calories}`);

  if (parts.length === 0) {
    return { content: [{ type: 'text', text: 'Provide at least one metric: sleep_hours, hrv, resting_hr, steps, active_calories' }], details: {} };
  }

  // Provide workout intensity recommendation based on recovery
  const lines = ['Health data synced:', '', ...parts];

  if (params.sleep_hours !== undefined || params.hrv !== undefined) {
    lines.push('', '--- Recovery Analysis ---');
    const poorRecovery = (params.sleep_hours !== undefined && params.sleep_hours < 6)
      || (params.hrv !== undefined && params.hrv < 40);

    if (poorRecovery) {
      lines.push(
        'Recovery is below optimal. Recommendations:',
        '- Reduce workout intensity by 10-20%',
        '- Focus on mobility/flexibility instead of heavy lifting',
        '- Prioritize sleep tonight',
        '- Consider a rest day if consecutive poor recovery',
      );
    } else {
      lines.push('Recovery looks good. Full intensity training is appropriate.');
    }
  }

  return { content: [{ type: 'text', text: lines.join('\n') }], details: {} };
}

// ── Helpers ──────────────────────────────────────────────────

function getRecentWorkoutsOfType(
  state: HealthState,
  typeOrFocus: string,
  days: number,
): WorkoutEntry[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const search = typeOrFocus.toLowerCase();

  return state.workoutLog.filter((w) => {
    if (w.date < cutoffStr) return false;
    if (!search) return true;
    return w.type.toLowerCase().includes(search)
      || w.name.toLowerCase().includes(search);
  });
}

function buildOverloadContext(workouts: WorkoutEntry[]): string[] {
  if (workouts.length === 0) return [];
  const lines: string[] = [];
  const last3 = workouts.slice(-3);
  for (const w of last3) {
    lines.push(`${w.date} — ${w.name} (${w.type}, ${w.duration}min)`);
    for (const ex of w.exercises.slice(0, 5)) {
      if (ex.sets && ex.sets.length > 0) {
        const setStr = ex.sets.map((s) => `${s.reps}x${s.weight}kg`).join(', ');
        lines.push(`  ${ex.name}: ${setStr}`);
      } else if (ex.duration) {
        lines.push(`  ${ex.name}: ${ex.duration}min${ex.distance ? ` / ${ex.distance}km` : ''}`);
      }
    }
  }
  return lines;
}
