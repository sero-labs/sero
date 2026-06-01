/**
 * ReminderCard — displays a single reminder with status, schedule, and actions.
 */

import { useState } from 'react';
import { Bell, Check, CheckCircle2, Clock3, Mail, Pause, Play, RefreshCw } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@sero-ai/ui/components/ui/alert-dialog';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card } from '@sero-ai/ui/components/ui/card';
import { cn } from '@sero-ai/ui/lib/utils';
import type { Reminder } from '../../shared/types';
import { SNOOZE_OPTIONS } from '../../shared/types';
import {
  statusLabel,
  nextFireDescription,
  formatDateTime,
} from '../../shared/reminder-utils';
import { cronToHuman } from '../../shared/cron';

interface ReminderCardProps {
  reminder: Reminder;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onSnooze: (id: string, minutes: number) => void;
  onComplete: (id: string) => void;
  onToggleEnabled: (id: string) => void;
}

export function ReminderCard({
  reminder,
  onEdit,
  onRemove,
  onSnooze,
  onComplete,
  onToggleEnabled,
}: ReminderCardProps) {
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);

  const isCompleted = reminder.status === 'completed';
  const isDisabled = reminder.status === 'disabled';
  const isSnoozed = reminder.status === 'snoozed';
  const dimmed = isCompleted || isDisabled;

  return (
    <>
      <Card className={cn('gap-0 py-0 shadow-none transition-colors', dimmed && 'opacity-50')}>
        <div className="px-4 py-3">
          {/* Header: title + badges */}
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {reminder.title}
            </span>
            <StatusBadge status={reminder.status} />
            <TypeBadge type={reminder.type} />
            {reminder.recoverIfMissed && (
              <Badge
                variant="outline"
                className="border-blue-500/30 text-[10px] text-blue-500"
                title="Notification will be shown on startup if missed"
              >
                Recover
              </Badge>
            )}
            {reminder.channel === 'email' && (
              <Badge variant="outline" className="inline-flex items-center gap-1 border-amber-500/30 text-[10px] text-amber-500">
                <Mail className="size-3" />
                legacy email
              </Badge>
            )}
          </div>

          {/* Schedule / fire time */}
          <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            {reminder.type === 'recurring' && reminder.schedule && (
              <>
                <code className="rounded bg-secondary px-2 py-0.5 text-foreground">
                  {reminder.schedule}
                </code>
                <span>{cronToHuman(reminder.schedule)}</span>
              </>
            )}
            {reminder.type === 'once' && reminder.fireAt && (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="size-3" />
                {formatDateTime(reminder.fireAt)}
              </span>
            )}
            {isSnoozed && reminder.snoozedUntil && (
              <span className="inline-flex items-center gap-1 text-amber-500">
                <Pause className="size-3" />
                Until {formatDateTime(reminder.snoozedUntil)}
              </span>
            )}
          </div>

          {/* Notes */}
          {reminder.notes && (
            <p className="mb-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {reminder.notes}
            </p>
          )}

          {/* Next fire info */}
          <p className="mb-3 text-[11px] text-muted-foreground">
            {nextFireDescription(reminder)}
            {reminder.lastFiredAt && (
              <> · Last fired: {formatDateTime(reminder.lastFiredAt)}</>
            )}
          </p>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-1.5">
            {!isCompleted && (
              <>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onEdit(reminder.id)}>
                  Edit
                </Button>
                <Button
                  variant="ghost" size="sm" className="h-7 text-xs"
                  onClick={() => onToggleEnabled(reminder.id)}
                >
                  {isDisabled ? (
                    <>
                      <Play className="size-3.5" />
                      Enable
                    </>
                  ) : (
                    <>
                      <Pause className="size-3.5" />
                      Disable
                    </>
                  )}
                </Button>
                {!isDisabled && (
                  <div className="relative">
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 text-xs text-amber-500 hover:text-amber-600"
                      onClick={() => setShowSnoozeMenu(!showSnoozeMenu)}
                    >
                      <Pause className="size-3.5" />
                      Snooze
                    </Button>
                    {showSnoozeMenu && (
                      <SnoozeDropdown
                        onSelect={(mins) => { onSnooze(reminder.id, mins); setShowSnoozeMenu(false); }}
                        onClose={() => setShowSnoozeMenu(false)}
                      />
                    )}
                  </div>
                )}
                <Button
                  variant="ghost" size="sm"
                  className="h-7 text-xs text-emerald-500 hover:text-emerald-600"
                  onClick={() => onComplete(reminder.id)}
                >
                  <Check className="size-3.5" />
                  Done
                </Button>
              </>
            )}
            <div className="flex-1" />
            <Button
              variant="ghost" size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={() => setShowRemoveConfirm(true)}
            >
              Remove
            </Button>
          </div>
        </div>
      </Card>

      {/* Remove confirmation */}
      <AlertDialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove reminder?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the reminder "{reminder.title}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => onRemove(reminder.id)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function StatusBadge({ status }: { status: Reminder['status'] }) {
  switch (status) {
    case 'active':
      return (
        <Badge variant="outline" className="inline-flex items-center gap-1 border-emerald-500/30 text-[10px] text-emerald-500">
          <Bell className="size-3" />
          Active
        </Badge>
      );
    case 'snoozed':
      return (
        <Badge variant="outline" className="inline-flex items-center gap-1 border-amber-500/30 text-[10px] text-amber-500">
          <Pause className="size-3" />
          Snoozed
        </Badge>
      );
    case 'completed':
      return (
        <Badge variant="secondary" className="inline-flex items-center gap-1 text-[10px]">
          <CheckCircle2 className="size-3" />
          Done
        </Badge>
      );
    case 'disabled':
      return (
        <Badge variant="secondary" className="inline-flex items-center gap-1 text-[10px]">
          <Pause className="size-3" />
          Paused
        </Badge>
      );
    default:
      return null;
  }
}

function TypeBadge({ type }: { type: Reminder['type'] }) {
  if (type === 'recurring') {
    return (
      <Badge variant="outline" className="inline-flex items-center gap-1 border-primary/30 text-[10px] text-primary">
        <RefreshCw className="size-3" />
        Recurring
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-muted-foreground/30 text-[10px] text-muted-foreground">
      Once
    </Badge>
  );
}

function SnoozeDropdown({
  onSelect,
  onClose,
}: {
  onSelect: (minutes: number) => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop to close dropdown */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-md">
        {SNOOZE_OPTIONS.map((opt) => (
          <button type="button"
            key={opt.minutes}
            className="w-full rounded-sm px-3 py-1.5 text-left text-xs text-popover-foreground hover:bg-accent"
            onClick={() => onSelect(opt.minutes)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </>
  );
}
