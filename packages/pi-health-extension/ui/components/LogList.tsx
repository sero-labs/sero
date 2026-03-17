/**
 * Combined food + workout log list for the Log tab.
 * Shows recent entries sorted by date, newest first.
 */

import type { NutritionEntry, WorkoutEntry } from '../../shared/types';
import { formatDate, daysAgo, getMealIcon, getWorkoutIcon, sortByDateDesc } from '../lib/utils';

interface LogListProps {
  nutritionLog: NutritionEntry[];
  workoutLog: WorkoutEntry[];
}

type LogEntry =
  | { kind: 'nutrition'; entry: NutritionEntry; date: string; createdAt: string }
  | { kind: 'workout'; entry: WorkoutEntry; date: string; createdAt: string };

function NutritionLogItem({ entry }: { entry: NutritionEntry }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-card px-3 py-2.5 transition-colors hover:bg-card/80">
      <span className="mt-0.5 text-lg">{getMealIcon(entry.meal)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-foreground truncate">{entry.description}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{daysAgo(entry.date)}</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span style={{ color: 'var(--health-calories)' }}>{entry.calories} cal</span>
          <span className="text-border">·</span>
          <span style={{ color: 'var(--health-protein)' }}>P:{entry.protein}g</span>
          <span style={{ color: 'var(--health-carbs)' }}>C:{entry.carbs}g</span>
          <span style={{ color: 'var(--health-fat)' }}>F:{entry.fat}g</span>
        </div>
        {!entry.confirmed && (
          <span className="mt-1 inline-block rounded bg-yellow-500/10 px-1.5 py-0.5 text-[10px] text-yellow-500">
            AI estimate — confirm in chat
          </span>
        )}
      </div>
    </div>
  );
}

function WorkoutLogItem({ entry }: { entry: WorkoutEntry }) {
  const exerciseCount = entry.exercises.length;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-card px-3 py-2.5 transition-colors hover:bg-card/80">
      <span className="mt-0.5 text-lg">{getWorkoutIcon(entry.type)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-foreground truncate">{entry.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{daysAgo(entry.date)}</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{entry.type}</span>
          {entry.duration > 0 && (
            <>
              <span className="text-border">·</span>
              <span>{entry.duration} min</span>
            </>
          )}
          {exerciseCount > 0 && (
            <>
              <span className="text-border">·</span>
              <span>{exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}</span>
            </>
          )}
        </div>
        {entry.notes && (
          <p className="mt-1 text-xs text-muted-foreground/60 line-clamp-1">{entry.notes}</p>
        )}
      </div>
    </div>
  );
}

export function LogList({ nutritionLog, workoutLog }: LogListProps) {
  // Merge and sort all entries by date descending
  const allEntries: LogEntry[] = [
    ...nutritionLog.map((entry) => ({
      kind: 'nutrition' as const,
      entry,
      date: entry.date,
      createdAt: entry.createdAt,
    })),
    ...workoutLog.map((entry) => ({
      kind: 'workout' as const,
      entry,
      date: entry.date,
      createdAt: entry.createdAt,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const recent = allEntries.slice(0, 50);

  if (recent.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <span className="text-4xl">📝</span>
        <p className="text-sm text-muted-foreground">No entries logged yet</p>
        <p className="text-xs text-muted-foreground/60">
          Tell the agent what you ate or your workout — it will log it automatically
        </p>
      </div>
    );
  }

  // Group by date
  const grouped = new Map<string, LogEntry[]>();
  for (const entry of recent) {
    const group = grouped.get(entry.date) ?? [];
    group.push(entry);
    grouped.set(entry.date, group);
  }

  return (
    <div className="flex flex-col gap-4">
      {Array.from(grouped.entries()).map(([date, entries]) => (
        <div key={date}>
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            {formatDate(date)} <span className="text-muted-foreground/50">({daysAgo(date)})</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {entries.map((item) =>
              item.kind === 'nutrition' ? (
                <NutritionLogItem key={item.entry.id} entry={item.entry} />
              ) : (
                <WorkoutLogItem key={item.entry.id} entry={item.entry} />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
