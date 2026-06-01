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
import { Card } from '@sero-ai/ui/components/ui/card';
import type { CronState, CronJob, Reminder, NotificationSettings } from '../shared/types';
import { DEFAULT_CRON_STATE, DEFAULT_NOTIFICATION_SETTINGS } from '../shared/types';
import {
  completeReminderById,
  removeReminderById,
  snoozeReminderById,
  toggleReminderDisabledState,
  upsertReminder,
} from '../shared/reminder-mutations';
import { CronAppHeader } from './components/CronAppHeader';
import { CronTabs } from './components/CronTabs';
import { JobForm } from './components/JobForm';
import { JobsTab } from './components/JobsTab';
import { ReminderForm } from './components/ReminderForm';
import { ReminderList } from './components/ReminderList';
import { RunHistory } from './components/RunHistory';
import { SchedulerBar } from './components/SchedulerBar';
import './styles.css';

type Tab = 'jobs' | 'reminders' | 'history';

const EMPTY_REMINDERS: Reminder[] = [];

export function CronApp() {
  const [state, updateState] = useAppState<CronState>(DEFAULT_CRON_STATE);
  const prompt = useAgentPrompt();

  const [showJobForm, setShowJobForm] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('reminders');

  // Ensure reminders array exists (migration)
  const reminders = state.reminders ?? EMPTY_REMINDERS;

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
      const next = {
        ...prev,
        reminders: [...(prev.reminders ?? [])],
      };
      upsertReminder(next, reminder);
      return next;
    });
  }, [updateState]);

  const handleRemoveReminder = useCallback((id: string) => {
    updateState((prev) => {
      const next = {
        ...prev,
        reminders: [...(prev.reminders ?? [])],
      };
      removeReminderById(next, id);
      return next;
    });
  }, [updateState]);

  const handleSnoozeReminder = useCallback((id: string, minutes: number) => {
    updateState((prev) => {
      const next = {
        ...prev,
        reminders: [...(prev.reminders ?? [])],
      };
      snoozeReminderById(next, id, minutes);
      return next;
    });
  }, [updateState]);

  const handleCompleteReminder = useCallback((id: string) => {
    updateState((prev) => {
      const next = {
        ...prev,
        reminders: [...(prev.reminders ?? [])],
      };
      completeReminderById(next, id);
      return next;
    });
  }, [updateState]);

  const handleToggleReminderEnabled = useCallback((id: string) => {
    updateState((prev) => {
      const target = (prev.reminders ?? []).find((reminder) => reminder.id === id);
      if (!target) return prev;
      const next = {
        ...prev,
        reminders: [...(prev.reminders ?? [])],
      };
      toggleReminderDisabledState(next, id, target.status !== 'disabled');
      return next;
    });
  }, [updateState]);

  // ── History ───────────────────────────────────────────────

  const handleClearHistory = useCallback(() => {
    updateState((prev) => ({ ...prev, lastRunResults: [] }));
  }, [updateState]);

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-background p-4">
      <CronAppHeader
        activeTab={activeTab}
        historyCount={state.lastRunResults.length}
        onAddReminder={handleAddReminder}
        onAddJob={handleAddJob}
        onClearHistory={handleClearHistory}
      />

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

      <CronTabs
        activeTab={activeTab}
        totalJobs={stats.totalJobs}
        totalReminders={stats.totalReminders}
        historyCount={state.lastRunResults.length}
        onSelect={setActiveTab}
      />

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

export default CronApp;
