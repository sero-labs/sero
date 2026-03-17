/**
 * Achievements view — badges, streak calendar, and narrative lookback.
 */

import { useCallback, useMemo } from 'react';
import type { HealthState, Achievement } from '../../shared/types';
import { useAgentPrompt } from '@sero/app-runtime';
import { getStreakMessage, todayISO } from '../lib/utils';

interface AchievementsViewProps {
  state: HealthState;
}

function AchievementCard({ achievement }: { achievement: Achievement }) {
  const icon = achievement.type === 'goal_completed' ? '🏆'
    : achievement.type === 'milestone_hit' ? '🎯'
    : '🔥';

  const dateStr = new Date(achievement.earnedAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="animate-fade-in-up flex items-start gap-3 rounded-xl border border-border bg-card p-4">
      <span className="text-2xl">{icon}</span>
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-semibold text-foreground">{achievement.title}</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">{achievement.description}</p>
        <span className="mt-1 inline-block text-[10px] text-muted-foreground/50">{dateStr}</span>
      </div>
    </div>
  );
}

function StreakDisplay({ streak }: { streak: number }) {
  const message = getStreakMessage(streak);

  return (
    <div className="rounded-xl border border-border bg-card p-5 text-center">
      <div className="text-4xl font-bold" style={{ color: 'var(--health-streak)' }}>
        {streak}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">Day Streak</div>
      <div className="mt-2 text-xs text-muted-foreground/70">{message}</div>

      {/* Streak milestones */}
      <div className="mt-4 flex justify-center gap-3">
        {[7, 14, 30, 60, 100].map((milestone) => (
          <div
            key={milestone}
            className={`flex flex-col items-center rounded-lg px-2 py-1 ${
              streak >= milestone ? 'opacity-100' : 'opacity-30'
            }`}
          >
            <span className="text-sm">{streak >= milestone ? '⭐' : '☆'}</span>
            <span className="text-[10px] text-muted-foreground">{milestone}d</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityHeatmap({ state }: { state: HealthState }) {
  const heatmapData = useMemo(() => {
    const today = new Date(todayISO() + 'T00:00:00');
    const days: Array<{ date: string; level: number }> = [];

    // Last 28 days (4 weeks)
    for (let i = 27; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      const hasMeals = state.nutritionLog.some((e) => e.date === dateStr);
      const hasWorkout = state.workoutLog.some((w) => w.date === dateStr);
      const hasWeight = state.bodyMetrics.some((m) => m.date === dateStr);

      const level = (hasMeals ? 1 : 0) + (hasWorkout ? 1 : 0) + (hasWeight ? 1 : 0);
      days.push({ date: dateStr, level });
    }
    return days;
  }, [state.nutritionLog, state.workoutLog, state.bodyMetrics]);

  const colors = ['transparent', 'var(--health-success)', 'var(--health-protein)', 'var(--health-streak)'];
  const opacities = [0.1, 0.3, 0.6, 0.9];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Activity (28 Days)</h3>
      <div className="grid grid-cols-7 gap-1.5">
        {heatmapData.map((day) => {
          const dayNum = new Date(day.date + 'T00:00:00').getDate();
          return (
            <div
              key={day.date}
              className="flex aspect-square items-center justify-center rounded-md text-[10px]"
              style={{
                backgroundColor: day.level > 0 ? colors[day.level] : 'var(--muted)',
                opacity: opacities[day.level],
              }}
              title={`${day.date}: ${day.level} activities`}
            >
              {dayNum}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-end gap-2 text-[10px] text-muted-foreground/60">
        <span>Less</span>
        {[0, 1, 2, 3].map((level) => (
          <div
            key={level}
            className="h-3 w-3 rounded-sm"
            style={{
              backgroundColor: level > 0 ? colors[level] : 'var(--muted)',
              opacity: opacities[level],
            }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

export function AchievementsView({ state }: AchievementsViewProps) {
  const prompt = useAgentPrompt();

  const handleLookback = useCallback(() => {
    prompt('Generate a narrative lookback summary of my health journey using the health tool with action lookback.');
  }, [prompt]);

  const sortedAchievements = useMemo(() => {
    return [...state.achievements].sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
  }, [state.achievements]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-foreground">Achievements</h2>

      <StreakDisplay streak={state.userContext.streak} />
      <ActivityHeatmap state={state} />

      {/* Achievement list */}
      {sortedAchievements.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Earned ({sortedAchievements.length})
          </h3>
          {sortedAchievements.map((a) => (
            <AchievementCard key={a.id} achievement={a} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <span className="text-3xl">🏅</span>
          <p className="mt-2 text-sm text-muted-foreground">No achievements yet</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Keep logging to earn your first achievement!
          </p>
        </div>
      )}

      {/* Lookback button */}
      {state.longTermGoals.some((g) => g.status === 'completed') && (
        <button
          onClick={handleLookback}
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          📖 Generate Journey Lookback
        </button>
      )}
    </div>
  );
}
