/**
 * ReminderForm, dialog for adding or editing a reminder.
 */

import { useState, useEffect, useCallback } from 'react';
import { Check, Clock3, Monitor, RefreshCw } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@sero-ai/ui/components/ui/dialog';
import { cn } from '@sero-ai/ui/lib/utils';
import { validateCron, cronToHuman } from '../../shared/cron';
import { generateId } from '../../shared/reminder-utils';
import { normalizeReminderChannel } from '../../shared/reminder-mutations';
import type { Reminder, ReminderType } from '../../shared/types';

interface ReminderFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (reminder: Reminder) => void;
  editingReminder?: Reminder | null;
}

const RECURRING_PRESETS = [
  { label: 'Every morning (9am)', value: '0 9 * * *' },
  { label: 'Weekday mornings', value: '0 9 * * 1-5' },
  { label: 'Every Friday morning', value: '0 9 * * 5' },
  { label: 'Every Monday 9am', value: '0 9 * * 1' },
  { label: 'Daily at noon', value: '0 12 * * *' },
  { label: 'Weekly (Sun 10am)', value: '0 10 * * 0' },
  { label: 'Monthly 1st at 9am', value: '0 9 1 * *' },
] as const;

export function ReminderForm({
  open,
  onClose,
  onSave,
  editingReminder,
}: ReminderFormProps) {
  const isEditing = !!editingReminder;

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [channel, setChannel] = useState<'notification'>('notification');
  const [type, setType] = useState<ReminderType>('once');
  const [fireAt, setFireAt] = useState('');
  const [schedule, setSchedule] = useState('');
  const [recoverIfMissed, setRecoverIfMissed] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // Reset form when opening
  useEffect(() => {
    if (!open) return;
    if (editingReminder) {
      setTitle(editingReminder.title);
      setNotes(editingReminder.notes ?? '');
      setChannel(normalizeReminderChannel(editingReminder.channel));
      setType(editingReminder.type);
      setFireAt(editingReminder.fireAt ? toLocalDatetime(editingReminder.fireAt) : '');
      setSchedule(editingReminder.schedule ?? '');
      setRecoverIfMissed(editingReminder.recoverIfMissed ?? false);
    } else {
      setTitle('');
      setNotes('');
      setChannel('notification');
      setType('once');
      setFireAt(defaultFireAt());
      setSchedule('');
      setRecoverIfMissed(false);
    }
    setScheduleError(null);
  }, [open, editingReminder]);

  // Validate cron
  useEffect(() => {
    if (type !== 'recurring' || !schedule.trim()) {
      setScheduleError(null);
      return;
    }
    setScheduleError(validateCron(schedule.trim()));
  }, [schedule, type]);

  const canSave = (() => {
    if (!title.trim()) return false;
    if (type === 'once' && !fireAt) return false;
    if (type === 'recurring' && (!schedule.trim() || scheduleError)) return false;
    return true;
  })();

  const handleSave = useCallback(() => {
    if (!canSave) return;

    const reminder: Reminder = {
      id: editingReminder?.id ?? generateId(),
      title: title.trim(),
      notes: notes.trim() || undefined,
      channel,
      type,
      status: editingReminder?.status ?? 'active',
      createdAt: editingReminder?.createdAt ?? new Date().toISOString(),
    };

    if (type === 'once') {
      reminder.fireAt = new Date(fireAt).toISOString();
    }
    if (type === 'recurring') {
      reminder.schedule = schedule.trim();
    }
    if (recoverIfMissed) reminder.recoverIfMissed = true;

    // Preserve history fields when editing
    if (editingReminder) {
      reminder.lastFiredAt = editingReminder.lastFiredAt;
      reminder.completedAt = editingReminder.completedAt;
      reminder.snoozedUntil = editingReminder.snoozedUntil;
    }

    onSave(reminder);
    onClose();
  }, [canSave, title, notes, channel, type, fireAt, schedule, recoverIfMissed, editingReminder, onSave, onClose]);

  const inputCls =
    'w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Reminder' : 'New Reminder'}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => { e.preventDefault(); handleSave(); }}
          className="flex flex-col gap-4 py-2"
        >
          {/* Title */}
          <div>
            <label htmlFor="reminder-title" className="mb-1 block text-xs font-medium text-muted-foreground">
              Title *
            </label>
            <input
              id="reminder-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Phone mum"
              className={inputCls}
            />
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="reminder-notes" className="mb-1 block text-xs font-medium text-muted-foreground">
              Notes
            </label>
            <textarea
              id="reminder-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional details..."
              rows={2}
              className={cn(inputCls, 'resize-y')}
            />
          </div>

          {/* Type toggle */}
          <div>
            <div className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Type *
            </div>
            <div className="flex gap-2">
              {(['once', 'recurring'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                    type === t
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-secondary',
                  )}
                >
                  {t === 'once' ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 className="size-3.5" />
                      One-time
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <RefreshCw className="size-3.5" />
                      Recurring
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* One-time: datetime picker */}
          {type === 'once' && (
            <div>
              <label htmlFor="reminder-fire-at" className="mb-1 block text-xs font-medium text-muted-foreground">
                When *
              </label>
              <input
                id="reminder-fire-at"
                type="datetime-local"
                value={fireAt}
                onChange={(e) => setFireAt(e.target.value)}
                className={inputCls}
              />
            </div>
          )}

          {/* Recurring: cron expression */}
          {type === 'recurring' && (
            <div>
              <label htmlFor="reminder-schedule" className="mb-1 block text-xs font-medium text-muted-foreground">
                Schedule (cron) *
              </label>
              <input
                id="reminder-schedule"
                type="text"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="0 9 * * 5"
                className={cn(inputCls, 'font-mono')}
              />
              {scheduleError ? (
                <p className="mt-1 text-sm text-destructive">{scheduleError}</p>
              ) : schedule.trim() ? (
                <p className="mt-1 inline-flex items-center gap-1 text-sm text-emerald-500">
                  <Check className="size-3" />
                  {cronToHuman(schedule.trim())}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  min hour dom month dow
                </p>
              )}
              {/* Presets */}
              <div className="mt-2 flex flex-wrap gap-1">
                {RECURRING_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setSchedule(p.value)}
                    className={cn(
                      'rounded-full border border-border px-2 py-0.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                      schedule === p.value && 'border-primary bg-primary/10 text-primary',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recover if missed */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input aria-label="Checkbox input"
              type="checkbox"
              checked={recoverIfMissed}
              onChange={(e) => setRecoverIfMissed(e.target.checked)}
              className="size-4 rounded border-input accent-primary"
            />
            <div>
              <span className="text-xs font-medium text-foreground">
                Recover if missed
              </span>
              <p className="text-sm text-muted-foreground">
                Show notification on startup if this reminder was missed while Sero was closed
              </p>
            </div>
          </label>

          {/* Channel */}
          <div>
            <div className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Notification Channel
            </div>
            <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-foreground">
              <div className="inline-flex items-center gap-1.5 font-medium">
                <Monitor className="size-3.5" />
                Desktop notification
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Email delivery is not supported yet. Saving this reminder will use the desktop notification path.
              </p>
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isEditing ? 'Save Changes' : 'Set Reminder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

/** Default fire-at: 1 hour from now, rounded to next 5 min. */
function defaultFireAt(): string {
  const d = new Date(Date.now() + 3_600_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  return toLocalDatetime(d.toISOString());
}

/** Convert ISO string to `datetime-local` input format. */
function toLocalDatetime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
