/**
 * Insights view — trend charts, weekly summary, and compliance check.
 */

import { useCallback, useMemo } from 'react';
import type { HealthState } from '../../shared/types';
import { useAgentPrompt } from '@sero/app-runtime';
import { WeightChart } from './WeightChart';
import { getDailyTotals, todayISO } from '../lib/utils';

interface InsightsViewProps {
  state: HealthState;
}

function WeeklySummary({ state }: { state: HealthState }) {
  const summary = useMemo(() => {
    const today = new Date(todayISO() + 'T00:00:00');
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    const meals = state.nutritionLog.filter((e) => e.date >= weekAgoStr);
    const workouts = state.workoutLog.filter((w) => w.date >= weekAgoStr);

    const daysLogged = new Set(meals.map((e) => e.date)).size;
    const totalCal = meals.reduce((s, e) => s + e.calories, 0);
    const avgCal = daysLogged > 0 ? Math.round(totalCal / daysLogged) : 0;
    const totalWorkoutMin = workouts.reduce((s, w) => s + w.duration, 0);

    return { daysLogged, avgCal, workoutCount: workouts.length, totalWorkoutMin };
  }, [state.nutritionLog, state.workoutLog]);

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-lg border border-border/50 bg-card p-3">
        <div className="text-xs text-muted-foreground">Days Logged (7d)</div>
        <div className="mt-1 text-lg font-semibold text-foreground">{summary.daysLogged}/7</div>
      </div>
      <div className="rounded-lg border border-border/50 bg-card p-3">
        <div className="text-xs text-muted-foreground">Avg Calories</div>
        <div className="mt-1 text-lg font-semibold" style={{ color: 'var(--health-calories)' }}>
          {summary.avgCal}
        </div>
      </div>
      <div className="rounded-lg border border-border/50 bg-card p-3">
        <div className="text-xs text-muted-foreground">Workouts (7d)</div>
        <div className="mt-1 text-lg font-semibold" style={{ color: 'var(--health-success)' }}>
          {summary.workoutCount}
        </div>
      </div>
      <div className="rounded-lg border border-border/50 bg-card p-3">
        <div className="text-xs text-muted-foreground">Active Minutes</div>
        <div className="mt-1 text-lg font-semibold text-foreground">{summary.totalWorkoutMin}</div>
      </div>
    </div>
  );
}

function CalorieHistory({ state }: { state: HealthState }) {
  const last7 = useMemo(() => {
    const days: Array<{ date: string; calories: number; target: number }> = [];
    const today = new Date(todayISO() + 'T00:00:00');
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const totals = getDailyTotals(state.nutritionLog, dateStr);
      days.push({ date: dateStr, calories: totals.calories, target: state.userContext.dailyCalorieTarget });
    }
    return days;
  }, [state.nutritionLog, state.userContext.dailyCalorieTarget]);

  const maxCal = Math.max(...last7.map((d) => Math.max(d.calories, d.target)), 1);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Calorie History (7 Days)</h3>
      <div className="flex items-end gap-1.5" style={{ height: 100 }}>
        {last7.map((day) => {
          const barH = (day.calories / maxCal) * 100;
          const targetH = (day.target / maxCal) * 100;
          const isOver = day.calories > day.target;
          const dayLabel = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'narrow' });

          return (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="relative w-full" style={{ height: 80 }}>
                {/* Target line */}
                <div
                  className="absolute left-0 right-0 border-t border-dashed opacity-30"
                  style={{ bottom: `${targetH * 0.8}%`, borderColor: 'var(--health-warning)' }}
                />
                {/* Bar */}
                <div
                  className="absolute bottom-0 left-1 right-1 rounded-t transition-all duration-500"
                  style={{
                    height: `${Math.min(barH * 0.8, 100)}%`,
                    backgroundColor: isOver ? 'var(--health-warning)' : 'var(--health-calories)',
                    opacity: day.calories > 0 ? 0.8 : 0.15,
                  }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground/60">{dayLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function InsightsView({ state }: InsightsViewProps) {
  const prompt = useAgentPrompt();

  const activeGoal = state.longTermGoals.find((g) => g.status === 'active');
  const hasWeightData = state.bodyMetrics.filter((m) => m.weight !== undefined).length >= 2;

  const handleAnalyze = useCallback((period: number) => {
    prompt(`Analyze my health trends for the last ${period} days using the health tool with action analyze_trends.`);
  }, [prompt]);

  const handleCompliance = useCallback(() => {
    prompt('Check my daily compliance and suggest any course corrections using the health tool.');
  }, [prompt]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Insights</h2>
        <div className="flex gap-2">
          <button
            onClick={handleCompliance}
            className="rounded-md bg-muted px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            Check Today
          </button>
          <button
            onClick={() => handleAnalyze(30)}
            className="rounded-md bg-muted px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            30-Day Report
          </button>
        </div>
      </div>

      <WeeklySummary state={state} />
      <CalorieHistory state={state} />

      {hasWeightData && (
        <WeightChart metrics={state.bodyMetrics} activeGoal={activeGoal} />
      )}

      {/* Quick insight buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => prompt('Review my workout progress and suggest progressive overload using the health tool.')}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
        >
          📈 Workout Progress
        </button>
        <button
          onClick={() => prompt('What correlations do you see between my sleep, workouts, and weight trends? Use the health tool to analyze.')}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
        >
          🔗 Correlations
        </button>
        <button
          onClick={() => handleAnalyze(7)}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
        >
          📊 Weekly Report
        </button>
      </div>
    </div>
  );
}
