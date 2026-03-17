/**
 * Dashboard view — daily summary with macro rings, workout status,
 * goal progress, and quick actions.
 */

import { useCallback } from 'react';
import type { HealthState } from '../../shared/types';
import { useAgentPrompt } from '@sero/app-runtime';
import { MacroRings } from './MacroRings';
import {
  getDailyTotals, getTodayWorkouts, getTotalWorkoutMinutes,
  getLatestWeight, getWeightChange, getStreakMessage,
  getGoalProgress, todayISO,
} from '../lib/utils';

interface DashboardProps {
  state: HealthState;
}

function StatCard({ label, value, subtitle, color }: {
  label: string;
  value: string;
  subtitle?: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold" style={color ? { color } : undefined}>
        {value}
      </div>
      {subtitle && <div className="text-[10px] text-muted-foreground/60">{subtitle}</div>}
    </div>
  );
}

function QuickActions() {
  const prompt = useAgentPrompt();

  const quickLog = useCallback((text: string) => {
    prompt(text);
  }, [prompt]);

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => quickLog('Log what I just ate')}
        className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
      >
        🍽️ Log Meal
      </button>
      <button
        onClick={() => quickLog('Log my workout')}
        className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
      >
        💪 Log Workout
      </button>
      <button
        onClick={() => quickLog('Log my weight')}
        className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
      >
        ⚖️ Log Weight
      </button>
      <button
        onClick={() => quickLog('Generate a recipe based on what I have in my pantry and my remaining macros for today')}
        className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
      >
        🍳 Suggest Recipe
      </button>
      <button
        onClick={() => quickLog('Generate a workout for me based on my current goals, equipment, and how I feel today')}
        className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
      >
        🏋️ Generate Workout
      </button>
    </div>
  );
}

export function Dashboard({ state }: DashboardProps) {
  const today = todayISO();
  const ctx = state.userContext;
  const nutrition = getDailyTotals(state.nutritionLog, today);
  const todayWorkouts = getTodayWorkouts(state.workoutLog, today);
  const workoutMinutes = getTotalWorkoutMinutes(todayWorkouts);
  const latestWeight = getLatestWeight(state.bodyMetrics);
  const weightChange = getWeightChange(state.bodyMetrics);
  const goalProgress = getGoalProgress(state);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Today</h2>
          <p className="text-xs text-muted-foreground">{ctx.currentPhase} phase</p>
        </div>
        {ctx.streak > 0 && (
          <div className="flex items-center gap-1.5 rounded-full px-3 py-1" style={{ backgroundColor: 'color-mix(in srgb, var(--health-streak) 15%, transparent)' }}>
            <span className="text-sm">🔥</span>
            <span className="text-xs font-semibold" style={{ color: 'var(--health-streak)' }}>
              {ctx.streak}d streak
            </span>
          </div>
        )}
      </div>

      {/* Macro Rings */}
      <div className="rounded-xl border border-border bg-card p-4">
        <MacroRings
          calories={nutrition.calories}
          calorieTarget={ctx.dailyCalorieTarget}
          protein={nutrition.protein}
          proteinTarget={ctx.dailyMacros.protein}
          carbs={nutrition.carbs}
          carbsTarget={ctx.dailyMacros.carbs}
          fat={nutrition.fat}
          fatTarget={ctx.dailyMacros.fat}
        />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          label="Meals Today"
          value={`${nutrition.meals}`}
          subtitle={`${nutrition.calories} / ${ctx.dailyCalorieTarget} cal`}
          color="var(--health-calories)"
        />
        <StatCard
          label="Workout"
          value={todayWorkouts.length > 0 ? `${workoutMinutes} min` : 'None'}
          subtitle={todayWorkouts.length > 0
            ? todayWorkouts.map((w) => w.name).join(', ')
            : 'No workout yet today'
          }
          color={todayWorkouts.length > 0 ? 'var(--health-success)' : undefined}
        />
        {latestWeight?.weight !== undefined && (
          <StatCard
            label="Weight"
            value={`${latestWeight.weight} kg`}
            subtitle={weightChange !== undefined
              ? `${weightChange >= 0 ? '+' : ''}${weightChange.toFixed(1)} kg`
              : latestWeight.date
            }
            color={weightChange !== undefined
              ? (weightChange < 0 ? 'var(--health-success)' : 'var(--health-warning)')
              : undefined
            }
          />
        )}
        {goalProgress !== undefined && (
          <StatCard
            label="Goal Progress"
            value={`${Math.round(goalProgress)}%`}
            subtitle={state.longTermGoals.find((g) => g.status === 'active')?.title}
            color="var(--health-success)"
          />
        )}
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">Quick Actions</h3>
        <QuickActions />
      </div>

      {/* Streak message */}
      {ctx.streak > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/50 px-4 py-3 text-center">
          <span className="text-sm text-muted-foreground">{getStreakMessage(ctx.streak)}</span>
        </div>
      )}
    </div>
  );
}
