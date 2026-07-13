/**
 * JobCard, displays a single cron job with actions.
 */

import { useState } from 'react';
import { Pause, Play } from 'lucide-react';
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
import { cronToHuman } from '../../shared/cron';
import type { CronJob } from '../../shared/types';

interface JobCardProps {
  job: CronJob;
  onEdit: (name: string) => void;
  onToggleEnabled: (name: string) => void;
  onRemove: (name: string) => void;
  onRun: (name: string) => void;
  schedulerActive: boolean;
}

export function JobCard({
  job,
  onEdit,
  onToggleEnabled,
  onRemove,
  onRun,
  schedulerActive,
}: JobCardProps) {
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const human = cronToHuman(job.schedule);

  return (
    <>
    <Card
      className={cn(
        'gap-0 py-0 shadow-none transition-colors',
        job.disabled && 'opacity-50',
      )}
    >
      <div className="px-4 py-3">
        {/* Header row: name + badges */}
        <div className="mb-2 flex items-center gap-2">
          <span className="text-base font-semibold text-foreground">
            {job.name}
          </span>

          {job.disabled ? (
            <Badge variant="secondary" className="text-sm">
              Paused
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-emerald-500/30 text-sm text-emerald-500"
            >
              Active
            </Badge>
          )}

          {job.channel !== 'cron' && (
            <Badge
              variant="outline"
              className="border-primary/30 text-sm text-primary"
            >
              {job.channel}
            </Badge>
          )}

          {job.model && (
            <Badge
              variant="outline"
              className="border-amber-500/30 text-sm font-mono text-amber-500"
            >
              {job.model}
            </Badge>
          )}

          {job.runIfMissed && (
            <Badge
              variant="outline"
              className="border-blue-500/30 text-sm text-blue-500"
              title="This job will run on startup if missed since midnight"
            >
              Recover
            </Badge>
          )}
        </div>

        {/* Schedule */}
        <div className="mb-1.5 flex items-center gap-2">
          <code className="rounded bg-secondary px-2 py-0.5 text-xs text-foreground">
            {job.schedule}
          </code>
          <span className="text-xs text-muted-foreground">{human}</span>
        </div>

        {/* Prompt (truncated) */}
        <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {job.prompt}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onEdit(job.name)}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onToggleEnabled(job.name)}
          >
            {job.disabled ? (
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
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onRun(job.name)}
            disabled={!schedulerActive}
            title={
              schedulerActive ? 'Run now' : 'Start scheduler first'
            }
          >
            <Play className="size-3.5" />
            Run
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
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
          <AlertDialogTitle>Remove "{job.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the cron job. This action cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={() => onRemove(job.name)}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
