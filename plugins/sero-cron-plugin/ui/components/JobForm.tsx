/**
 * JobForm — dialog for adding or editing a cron job.
 */

import { useState, useEffect, useCallback } from 'react';
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
import { ModelPicker } from './ModelPicker';
import type { CronJob } from '../../shared/types';

interface JobFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (job: CronJob) => void;
  /** If set, we're editing an existing job. */
  editingJob?: CronJob | null;
}

export function JobForm({ open, onClose, onSave, editingJob }: JobFormProps) {
  const isEditing = !!editingJob;

  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('');
  const [prompt, setPrompt] = useState('');
  const [channel, setChannel] = useState('cron');
  const [model, setModel] = useState('');
  const [runIfMissed, setRunIfMissed] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // Reset form when opening
  useEffect(() => {
    if (open) {
      if (editingJob) {
        setName(editingJob.name);
        setSchedule(editingJob.schedule);
        setPrompt(editingJob.prompt);
        setChannel(editingJob.channel);
        setModel(editingJob.model ?? '');
        setRunIfMissed(editingJob.runIfMissed ?? false);
      } else {
        setName('');
        setSchedule('');
        setPrompt('');
        setChannel('cron');
        setModel('');
        setRunIfMissed(false);
      }
      setNameError(null);
      setScheduleError(null);
    }
  }, [open, editingJob]);

  // Validate name on change
  useEffect(() => {
    if (!name.trim()) {
      setNameError(null);
      return;
    }
    if (/\s/.test(name)) {
      setNameError('Name must not contain spaces');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      setNameError('Only letters, numbers, hyphens, and underscores allowed');
      return;
    }
    setNameError(null);
  }, [name]);

  // Validate schedule on change
  useEffect(() => {
    if (!schedule.trim()) {
      setScheduleError(null);
      return;
    }
    const err = validateCron(schedule.trim());
    setScheduleError(err);
  }, [schedule]);

  const canSave =
    name.trim() &&
    !nameError &&
    schedule.trim() &&
    prompt.trim() &&
    !scheduleError;

  const handleSave = useCallback(() => {
    if (!canSave) return;
    const job: CronJob = {
      name: name.trim(),
      schedule: schedule.trim(),
      prompt: prompt.trim(),
      channel: channel.trim() || 'cron',
      disabled: editingJob?.disabled ?? false,
    };
    if (model.trim()) job.model = model.trim();
    if (runIfMissed) job.runIfMissed = true;
    onSave(job);
    onClose();
  }, [canSave, name, schedule, prompt, channel, model, editingJob, onSave, onClose]);

  const inputCls =
    'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Cron Job' : 'New Cron Job'}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className="flex flex-col gap-4 py-2"
        >
          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="daily-standup"
              className={inputCls}
              disabled={isEditing}
              autoFocus={!isEditing}
            />
            {nameError ? (
              <p className="mt-1 text-[11px] text-destructive">
                {nameError}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Unique identifier — letters, numbers, hyphens, underscores only
              </p>
            )}
          </div>

          {/* Schedule */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Schedule *
            </label>
            <input
              type="text"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="0 9 * * 1-5"
              className={cn(inputCls, 'font-mono')}
              autoFocus={isEditing}
            />
            {scheduleError ? (
              <p className="mt-1 text-[11px] text-destructive">
                {scheduleError}
              </p>
            ) : schedule.trim() ? (
              <p className="mt-1 text-[11px] text-emerald-500">
                ✓ {cronToHuman(schedule.trim())}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">
                min hour dom month dow
              </p>
            )}

            {/* Presets */}
            <div className="mt-2 flex flex-wrap gap-1">
              {CRON_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setSchedule(p.value)}
                  className={cn(
                    'rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                    schedule === p.value && 'border-primary bg-primary/10 text-primary',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Prompt *
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should the agent do when this job fires?"
              rows={3}
              className={cn(inputCls, 'resize-y')}
            />
          </div>

          {/* Channel */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Channel
            </label>
            <input
              type="text"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder="cron"
              className={inputCls}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Grouping tag (default: cron)
            </p>
          </div>

          {/* Model */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Model
            </label>
            <ModelPicker value={model} onChange={setModel} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Choose a model or leave as default.
            </p>
          </div>

          {/* Run if missed */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={runIfMissed}
              onChange={(e) => setRunIfMissed(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <div>
              <span className="text-xs font-medium text-foreground">
                Run if missed
              </span>
              <p className="text-[11px] text-muted-foreground">
                Run once on startup if this job was missed since midnight today
              </p>
            </div>
          </label>
        </form>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isEditing ? 'Save Changes' : 'Add Job'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
