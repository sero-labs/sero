/**
 * CronApp — Sero web UI for the cron scheduler extension.
 *
 * Tabs: Jobs | Reminders | History
 *
 * Uses useAppState to read/write the same state.json the Pi extension
 * writes. Changes from either direction are reflected instantly.
 */

import { useState, useCallback, useMemo } from 'react';
import { useAppState, useAgentPrompt } from '@sero-ai/app-runtime';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card } from '@sero-ai/ui/components/ui/card';
import type { CronState, CronJob, Reminder, NotificationSettings } from '../shared/types';
import { DEFAULT_CRON_STATE, DEFAULT_NOTIFICATION_SETTINGS } from '../shared/types';
import { snoozeReminder } from '../shared/reminder-utils';
import { SchedulerBar } from './components/SchedulerBar';
import { JobCard } from './components/JobCard';
import { JobForm } from './components/JobForm';
import { RunHistory } from './components/RunHistory';
import { ReminderList } from './components/ReminderList';
import { ReminderForm } from './components/ReminderForm';
import './styles.css';

type Tab = 'jobs' | 'reminders' | 'history';

export function CronApp() {
  const [state, updateState] = useAppState<CronState>(DEFAULT_CRON_STATE);
  const prompt = useAgentPrompt();

  const [showJobForm, setShowJobForm] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('reminders');

  // Ensure reminders array exists (migration)
  const reminders = state.reminders ?? [];

  // ── Derived stats ────────────────────────────────────────

  const stats = useMemo(() => {
    const totalJobs = state.jobs.length;
    const activeJobs = state.jobs.filter((j) => !j.disabled).length;
    const disabledJobs = totalJobs - activeJobs;
    const totalReminders = reminders.length;
    const activeReminders = reminders.filter(
      (r) => r.status === 'active' || r.status === 'snoozed',
    ).length;
    return { totalJobs, activeJobs, disabledJobs, totalReminders, activeReminders };
  }, [state.jobs, reminders]);

  // ── Scheduler toggle ─────────────────────────────────────

  const toggleScheduler = useCallback(() => {
    prompt(state.schedulerActive
      ? 'Stop the cron scheduler using /cron off'
      : 'Start the cron scheduler using /cron on');
  }, [state.schedulerActive, prompt]);

  const handleAutostartChange = useCallback(
    (enabled: boolean) => updateState((prev) => ({ ...prev, autostart: enabled })),
    [updateState],
  );

  const handleNotificationSettingsChange = useCallback(
    (settings: NotificationSettings) =>
      updateState((prev) => ({ ...prev, notificationSettings: settings })),
    [updateState],
  );

  // ── Job CRUD ─────────────────────────────────────────────

  const handleAddJob = useCallback(() => { setEditingJob(null); setShowJobForm(true); }, []);

  const handleEditJob = useCallback((name: string) => {
    const job = state.jobs.find((j) => j.name === name);
    if (job) { setEditingJob(job); setShowJobForm(true); }
  }, [state.jobs]);

  const handleSaveJob = useCallback((job: CronJob) => {
    updateState((prev) => {
      const idx = prev.jobs.findIndex((j) => j.name === job.name);
      const jobs = idx >= 0
        ? prev.jobs.map((j) => (j.name === job.name ? job : j))
        : [...prev.jobs, job];
      return { ...prev, jobs };
    });
  }, [updateState]);

  const handleToggleJobEnabled = useCallback((name: string) => {
    updateState((prev) => ({
      ...prev,
      jobs: prev.jobs.map((j) => j.name === name ? { ...j, disabled: !j.disabled } : j),
    }));
  }, [updateState]);

  const handleRemoveJob = useCallback((name: string) => {
    updateState((prev) => ({ ...prev, jobs: prev.jobs.filter((j) => j.name !== name) }));
  }, [updateState]);

  const handleRunJob = useCallback((name: string) => {
    prompt(`Run the cron job "${name}" immediately using the cron tool with action run.`);
  }, [prompt]);

  // ── Reminder CRUD ────────────────────────────────────────

  const handleAddReminder = useCallback(() => {
    setEditingReminder(null); setShowReminderForm(true);
  }, []);

  const handleEditReminder = useCallback((id: string) => {
    const r = reminders.find((rem) => rem.id === id);
    if (r) { setEditingReminder(r); setShowReminderForm(true); }
  }, [reminders]);

  const handleSaveReminder = useCallback((reminder: Reminder) => {
    updateState((prev) => {
      const list = prev.reminders ?? [];
      const idx = list.findIndex((r) => r.id === reminder.id);
      const updated = idx >= 0
        ? list.map((r) => (r.id === reminder.id ? reminder : r))
        : [...list, reminder];
      return { ...prev, reminders: updated };
    });
  }, [updateState]);

  const handleRemoveReminder = useCallback((id: string) => {
    updateState((prev) => ({
      ...prev,
      reminders: (prev.reminders ?? []).filter((r) => r.id !== id),
    }));
  }, [updateState]);

  const handleSnoozeReminder = useCallback((id: string, minutes: number) => {
    updateState((prev) => ({
      ...prev,
      reminders: (prev.reminders ?? []).map((r) =>
        r.id === id ? snoozeReminder(r, minutes) : r,
      ),
    }));
  }, [updateState]);

  const handleCompleteReminder = useCallback((id: string) => {
    updateState((prev) => ({
      ...prev,
      reminders: (prev.reminders ?? []).map((r) =>
        r.id === id
          ? { ...r, status: 'completed' as const, completedAt: new Date().toISOString(), snoozedUntil: undefined }
          : r,
      ),
    }));
  }, [updateState]);

  const handleToggleReminderEnabled = useCallback((id: string) => {
    updateState((prev) => ({
      ...prev,
      reminders: (prev.reminders ?? []).map((r) =>
        r.id === id
          ? { ...r, status: r.status === 'disabled' ? 'active' as const : 'disabled' as const, snoozedUntil: undefined }
          : r,
      ),
    }));
  }, [updateState]);

  // ── History ───────────────────────────────────────────────

  const handleClearHistory = useCallback(() => {
    updateState((prev) => ({ ...prev, lastRunResults: [] }));
  }, [updateState]);

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-background p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            ⏰ Scheduler
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Cron jobs, reminders, and notifications
          </p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'reminders' && (
            <Button size="sm" onClick={handleAddReminder}>+ Reminder</Button>
          )}
          {activeTab === 'jobs' && (
            <Button size="sm" onClick={handleAddJob}>+ Job</Button>
          )}
          {activeTab === 'history' && state.lastRunResults.length > 0 && (
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={handleClearHistory}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Scheduler status bar */}
      <div className="mb-3">
        <SchedulerBar
          active={state.schedulerActive}
          autostart={state.autostart}
          jobCount={stats.totalJobs}
          activeCount={stats.activeJobs}
          disabledCount={stats.disabledJobs}
          reminderCount={stats.activeReminders}
          notificationSettings={state.notificationSettings ?? DEFAULT_NOTIFICATION_SETTINGS}
          onToggle={toggleScheduler}
          onAutostartChange={handleAutostartChange}
          onNotificationSettingsChange={handleNotificationSettingsChange}
        />
      </div>

      {/* Tab bar */}
      <div className="mb-3 flex gap-1 border-b border-border">
        {([
          { key: 'reminders' as const, label: `Reminders (${stats.totalReminders})` },
          { key: 'jobs' as const, label: `Jobs (${stats.totalJobs})` },
          { key: 'history' as const, label: `History (${state.lastRunResults.length})` },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'reminders' && (
          <ReminderList
            reminders={reminders}
            onEdit={handleEditReminder}
            onRemove={handleRemoveReminder}
            onSnooze={handleSnoozeReminder}
            onComplete={handleCompleteReminder}
            onToggleEnabled={handleToggleReminderEnabled}
            onAdd={handleAddReminder}
          />
        )}
        {activeTab === 'jobs' && (
          <JobsTab
            jobs={state.jobs}
            schedulerActive={state.schedulerActive}
            onEdit={handleEditJob}
            onToggleEnabled={handleToggleJobEnabled}
            onRemove={handleRemoveJob}
            onRun={handleRunJob}
            onAdd={handleAddJob}
          />
        )}
        {activeTab === 'history' && (
          <Card className="gap-0 py-0 shadow-none">
            <RunHistory results={state.lastRunResults} />
          </Card>
        )}
      </div>

      {/* Dialogs */}
      <JobForm
        open={showJobForm}
        onClose={() => setShowJobForm(false)}
        onSave={handleSaveJob}
        editingJob={editingJob}
      />
      <ReminderForm
        open={showReminderForm}
        onClose={() => setShowReminderForm(false)}
        onSave={handleSaveReminder}
        editingReminder={editingReminder}
      />
    </div>
  );
}

// ── Jobs sub-component ─────────────────────────────────────────

function JobsTab({
  jobs, schedulerActive, onEdit, onToggleEnabled, onRemove, onRun, onAdd,
}: {
  jobs: CronJob[];
  schedulerActive: boolean;
  onEdit: (name: string) => void;
  onToggleEnabled: (name: string) => void;
  onRemove: (name: string) => void;
  onRun: (name: string) => void;
  onAdd: () => void;
}) {
  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center animate-cron-fade-in">
        <div className="mb-4 text-4xl">⏰</div>
        <h2 className="text-base font-medium text-foreground">No cron jobs yet</h2>
        <p className="mt-1.5 max-w-[240px] text-xs leading-relaxed text-muted-foreground">
          Create a job to schedule recurring agent prompts.
        </p>
        <Button size="sm" className="mt-4" onClick={onAdd}>+ New Job</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 animate-cron-fade-in">
      {jobs.map((job) => (
        <JobCard
          key={job.name}
          job={job}
          onEdit={onEdit}
          onToggleEnabled={onToggleEnabled}
          onRemove={onRemove}
          onRun={onRun}
          schedulerActive={schedulerActive}
        />
      ))}
    </div>
  );
}

export default CronApp;
