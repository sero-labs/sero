/**
 * ReminderList — filterable list of reminders with empty state.
 */

import { useState, useMemo } from 'react';
import { Bell, Plus } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { cn } from '@sero-ai/ui/lib/utils';
import type { Reminder, ReminderStatus } from '../../shared/types';
import { ReminderCard } from './ReminderCard';

type FilterKey = 'all' | 'active' | 'snoozed' | 'completed' | 'disabled';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'snoozed', label: 'Snoozed' },
  { key: 'completed', label: 'Done' },
  { key: 'disabled', label: 'Paused' },
];

interface ReminderListProps {
  reminders: Reminder[];
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onSnooze: (id: string, minutes: number) => void;
  onComplete: (id: string) => void;
  onToggleEnabled: (id: string) => void;
  onAdd: () => void;
}

export function ReminderList({
  reminders,
  onEdit,
  onRemove,
  onSnooze,
  onComplete,
  onToggleEnabled,
  onAdd,
}: ReminderListProps) {
  const [filter, setFilter] = useState<FilterKey>('all');

  // Count per filter
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: reminders.length,
      active: 0,
      snoozed: 0,
      completed: 0,
      disabled: 0,
    };
    for (const r of reminders) {
      if (r.status in c) c[r.status as FilterKey]++;
    }
    return c;
  }, [reminders]);

  // Filtered + sorted
  const filtered = useMemo(() => {
    let list = reminders;
    if (filter !== 'all') {
      list = list.filter((r) => r.status === filter);
    }
    return sortReminders(list);
  }, [reminders, filter]);

  if (reminders.length === 0) {
    return <EmptyState onAdd={onAdd} />;
  }

  return (
    <div className="flex flex-col gap-3 animate-cron-fade-in">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const count = counts[f.key];
          if (f.key !== 'all' && count === 0) return null;
          return (
            <button type="button"
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-medium transition-colors',
                filter === f.key
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              {f.label}
              <Badge
                variant="secondary"
                className="ml-0.5 h-4 min-w-[16px] px-1 text-sm"
              >
                {count}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Reminder cards */}
      {filtered.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          No {filter} reminders
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((reminder) => (
            <ReminderCard
              key={reminder.id}
              reminder={reminder}
              onEdit={onEdit}
              onRemove={onRemove}
              onSnooze={onSnooze}
              onComplete={onComplete}
              onToggleEnabled={onToggleEnabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sorting ──────────────────────────────────────────────────────

const STATUS_ORDER: Record<ReminderStatus, number> = {
  snoozed: 0,
  active: 1,
  disabled: 2,
  completed: 3,
};

function sortReminders(list: Reminder[]): Reminder[] {
  return [...list].sort((a, b) => {
    // Status order first
    const sa = STATUS_ORDER[a.status] ?? 9;
    const sb = STATUS_ORDER[b.status] ?? 9;
    if (sa !== sb) return sa - sb;

    // Then by next fire time (soonest first)
    const ta = getNextFireTime(a);
    const tb = getNextFireTime(b);
    if (ta !== tb) return ta - tb;

    // Then by creation date (newest first)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function getNextFireTime(r: Reminder): number {
  if (r.status === 'snoozed' && r.snoozedUntil) {
    return new Date(r.snoozedUntil).getTime();
  }
  if (r.type === 'once' && r.fireAt) {
    return new Date(r.fireAt).getTime();
  }
  return Infinity; // recurring without specific next time
}

// ── Empty state ──────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-cron-fade-in">
      <Bell className="mb-4 size-10 text-muted-foreground" />
      <h2 className="text-base font-medium text-foreground">
        No reminders yet
      </h2>
      <p className="mt-1.5 max-w-[280px] text-xs leading-relaxed text-muted-foreground">
        Create a reminder to get notified at a specific time, or ask the agent
        something like "Remind me in 1 hour to phone mum".
      </p>
      <Button size="sm" className="mt-4" onClick={onAdd}>
        <Plus className="size-3.5" />
        New Reminder
      </Button>
    </div>
  );
}
