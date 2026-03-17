/**
 * UI utility functions for formatting, calculations, and display helpers.
 */

import type { HealthState, NutritionEntry, WorkoutEntry, BodyMetric } from '../../shared/types';

// ── Date helpers ─────────────────────────────────────────────

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function daysAgo(dateStr: string): string {
  const now = new Date(todayISO() + 'T00:00:00');
  const then = new Date(dateStr + 'T00:00:00');
  const diff = Math.floor((now.getTime() - then.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${diff}d ago`;
}

// ── Nutrition helpers ────────────────────────────────────────

export function getDailyTotals(entries: NutritionEntry[], date?: string) {
  const targetDate = date || todayISO();
  const dayEntries = entries.filter((e) => e.date === targetDate);
  return {
    calories: dayEntries.reduce((sum, e) => sum + e.calories, 0),
    protein: dayEntries.reduce((sum, e) => sum + e.protein, 0),
    carbs: dayEntries.reduce((sum, e) => sum + e.carbs, 0),
    fat: dayEntries.reduce((sum, e) => sum + e.fat, 0),
    meals: dayEntries.length,
  };
}

export function getMealIcon(meal: string): string {
  switch (meal) {
    case 'breakfast': return '🌅';
    case 'lunch': return '☀️';
    case 'dinner': return '🌙';
    case 'snack': return '🍎';
    default: return '🍽️';
  }
}

// ── Fitness helpers ──────────────────────────────────────────

export function getWorkoutIcon(type: string): string {
  switch (type) {
    case 'strength': return '🏋️';
    case 'cardio': return '🏃';
    case 'flexibility': return '🧘';
    case 'sport': return '⚽';
    default: return '💪';
  }
}

export function getTodayWorkouts(workouts: WorkoutEntry[], date?: string): WorkoutEntry[] {
  const targetDate = date || todayISO();
  return workouts.filter((w) => w.date === targetDate);
}

export function getTotalWorkoutMinutes(workouts: WorkoutEntry[]): number {
  return workouts.reduce((sum, w) => sum + w.duration, 0);
}

// ── Body metric helpers ──────────────────────────────────────

export function getLatestWeight(metrics: BodyMetric[]): BodyMetric | undefined {
  return [...metrics]
    .filter((m) => m.weight !== undefined)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

export function getWeightChange(metrics: BodyMetric[]): number | undefined {
  const sorted = [...metrics]
    .filter((m) => m.weight !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return undefined;
  return sorted[sorted.length - 1].weight! - sorted[sorted.length - 2].weight!;
}

// ── Progress helpers ─────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function progressPercent(current: number, target: number): number {
  if (target === 0) return 0;
  return clamp((current / target) * 100, 0, 100);
}

/** Get streak encouragement message based on current streak count. */
export function getStreakMessage(streak: number): string {
  if (streak === 0) return 'Start your streak today!';
  if (streak < 3) return 'Building momentum!';
  if (streak < 7) return 'Great consistency!';
  if (streak < 14) return 'On fire!';
  if (streak < 30) return 'Unstoppable!';
  return 'Legendary dedication!';
}

/** Sort entries by date descending (newest first). */
export function sortByDateDesc<T extends { date: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date));
}

/** Get recent entries (last N). */
export function getRecent<T extends { date: string }>(entries: T[], count: number): T[] {
  return sortByDateDesc(entries).slice(0, count);
}

/** Calculate goal progress percentage for weight-based goals. */
export function getGoalProgress(state: HealthState): number | undefined {
  const activeGoal = state.longTermGoals.find((g) => g.status === 'active');
  if (!activeGoal) return undefined;

  const latest = getLatestWeight(state.bodyMetrics);
  if (!latest?.weight) return undefined;

  const totalDistance = Math.abs(activeGoal.startValue - activeGoal.targetValue);
  if (totalDistance === 0) return 100;

  const currentDistance = Math.abs(latest.weight - activeGoal.startValue);
  return clamp((currentDistance / totalDistance) * 100, 0, 100);
}
