/**
 * LoopScheduleForm, dialog for editing a scheduled loop's cron schedule.
 * Only the schedule is editable here — the loop itself is managed in the
 * Orchestrator app. Saving goes through the Orchestrator tool, so the dialog
 * stays open with the error when the update fails.
 */

import { useState, useEffect, useCallback } from 'react';
import { Check } from 'lucide-react';
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
import { CRON_PRESETS } from '../lib/cron-utils';
import type { ScheduledTriggerRow } from '../lib/orchestrator-loops';

interface LoopScheduleFormProps {
  /** The row being edited, or null when the dialog is closed. */
  row: ScheduledTriggerRow | null;
  onClose: () => void;
  /** Persists the new schedule; resolves to null on success, an error message otherwise. */
  onSave: (row: ScheduledTriggerRow, schedule: string) => Promise<string | null>;
}

export function LoopScheduleForm({ row, onClose, onSave }: LoopScheduleFormProps) {
  const [schedule, setSchedule] = useState('');
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset to the row's current schedule when opening
  useEffect(() => {
    if (row) {
      setSchedule(row.schedule);
      setScheduleError(null);
      setSaveError(null);
      setBusy(false);
    }
  }, [row]);

  // Validate schedule on change
  useEffect(() => {
    setScheduleError(schedule.trim() ? validateCron(schedule.trim()) : null);
  }, [schedule]);

  const canSave = !!schedule.trim() && !scheduleError && !busy;

  const handleSave = useCallback(async () => {
    if (!row || !canSave) return;
    setBusy(true);
    setSaveError(null);
    const error = await onSave(row, schedule.trim());
    setBusy(false);
    if (error) {
      setSaveError(error);
      return;
    }
    onClose();
  }, [row, canSave, schedule, onSave, onClose]);

  const inputCls =
    'w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';

  return (
    <Dialog open={!!row} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit schedule — {row?.title}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
          className="flex flex-col gap-4 py-2"
        >
          <div>
            <label htmlFor="loop-schedule" className="mb-1 block text-xs font-medium text-muted-foreground">
              Schedule (UTC) *
            </label>
            <input
              id="loop-schedule"
              type="text"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="0 9 * * 1-5"
              className={cn(inputCls, 'font-mono')}
            />
            {scheduleError ? (
              <p className="mt-1 text-sm text-destructive">{scheduleError}</p>
            ) : schedule.trim() ? (
              <p className="mt-1 inline-flex items-center gap-1 text-sm text-emerald-500">
                <Check className="size-3" />
                {cronToHuman(schedule.trim())} (UTC)
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">min hour dom month dow</p>
            )}

            {/* Presets */}
            <div className="mt-2 flex flex-wrap gap-1">
              {CRON_PRESETS.map((p) => (
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

          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        </form>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={!canSave}>
            {busy ? 'Saving…' : 'Save Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
