/**
 * CronApp — Sero web UI for the cron scheduler extension.
 *
 * Uses useAppState to read/write the same state.json the Pi extension
 * writes. Changes from either direction are reflected instantly.
 */

import { useState, useCallback, useMemo } from 'react';
import { useAppState, useAgentPrompt } from '@sero/app-runtime';
import { Button } from '@sero/ui/components/ui/button';
import { Card } from '@sero/ui/components/ui/card';
import type { CronState, CronJob } from '../shared/types';
import { DEFAULT_CRON_STATE } from '../shared/types';
import { SchedulerBar } from './components/SchedulerBar';
import { JobCard } from './components/JobCard';
import { JobForm } from './components/JobForm';
import { RunHistory } from './components/RunHistory';
import './styles.css';

type Tab = 'jobs' | 'history';

export function CronApp() {
  const [state, updateState] = useAppState<CronState>(DEFAULT_CRON_STATE);
  const prompt = useAgentPrompt();

  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('jobs');

  // ── Derived stats ────────────────────────────────────────

  const stats = useMemo(() => {
    const total = state.jobs.length;
    const active = state.jobs.filter((j) => !j.disabled).length;
    const disabled = total - active;
    return { total, active, disabled };
  }, [state.jobs]);

  // ── Scheduler toggle (via agent) ─────────────────────────

  const toggleScheduler = useCallback(() => {
    if (state.schedulerActive) {
      prompt('Stop the cron scheduler using /cron off');
    } else {
      prompt('Start the cron scheduler using /cron on');
    }
  }, [state.schedulerActive, prompt]);

  // ── Autostart toggle ─────────────────────────────────────

  const handleAutostartChange = useCallback(
    (enabled: boolean) => {
      updateState((prev) => ({ ...prev, autostart: enabled }));
    },
    [updateState],
  );

  // ── Job CRUD ─────────────────────────────────────────────

  const handleAddJob = useCallback(() => {
    setEditingJob(null);
    setShowForm(true);
  }, []);

  const handleEditJob = useCallback(
    (name: string) => {
      const job = state.jobs.find((j) => j.name === name);
      if (job) {
        setEditingJob(job);
        setShowForm(true);
      }
    },
    [state.jobs],
  );

  const handleSaveJob = useCallback(
    (job: CronJob) => {
      updateState((prev) => {
        const existing = prev.jobs.findIndex((j) => j.name === job.name);
        const jobs =
          existing >= 0
            ? prev.jobs.map((j) => (j.name === job.name ? job : j))
            : [...prev.jobs, job];
        return { ...prev, jobs };
      });
    },
    [updateState],
  );

  const handleToggleEnabled = useCallback(
    (name: string) => {
      updateState((prev) => ({
        ...prev,
        jobs: prev.jobs.map((j) =>
          j.name === name ? { ...j, disabled: !j.disabled } : j,
        ),
      }));
    },
    [updateState],
  );

  const handleRemoveJob = useCallback(
    (name: string) => {
      updateState((prev) => ({
        ...prev,
        jobs: prev.jobs.filter((j) => j.name !== name),
      }));
    },
    [updateState],
  );

  const handleRunJob = useCallback(
    (name: string) => {
      prompt(`Run the cron job "${name}" immediately using the cron tool with action run.`);
    },
    [prompt],
  );

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-background p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            ⏰ Cron Scheduler
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Schedule recurring agent prompts
          </p>
        </div>
        <Button size="sm" onClick={handleAddJob}>
          + New Job
        </Button>
      </div>

      {/* Scheduler status bar */}
      <div className="mb-3">
        <SchedulerBar
          active={state.schedulerActive}
          autostart={state.autostart}
          jobCount={stats.total}
          activeCount={stats.active}
          disabledCount={stats.disabled}
          onToggle={toggleScheduler}
          onAutostartChange={handleAutostartChange}
        />
      </div>

      {/* Tab bar */}
      <div className="mb-3 flex gap-1 border-b border-border">
        {(['jobs', 'history'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'jobs'
              ? `Jobs (${stats.total})`
              : `History (${state.lastRunResults.length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'jobs' ? (
          <JobsTab
            jobs={state.jobs}
            schedulerActive={state.schedulerActive}
            onEdit={handleEditJob}
            onToggleEnabled={handleToggleEnabled}
            onRemove={handleRemoveJob}
            onRun={handleRunJob}
            onAdd={handleAddJob}
          />
        ) : (
          <Card className="gap-0 py-0 shadow-none">
            <RunHistory results={state.lastRunResults} />
          </Card>
        )}
      </div>

      {/* Add/Edit dialog */}
      <JobForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSave={handleSaveJob}
        editingJob={editingJob}
      />
    </div>
  );
}

// ── Sub-component ──────────────────────────────────────────────

function JobsTab({
  jobs,
  schedulerActive,
  onEdit,
  onToggleEnabled,
  onRemove,
  onRun,
  onAdd,
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
        <h2 className="text-base font-medium text-foreground">
          No cron jobs yet
        </h2>
        <p className="mt-1.5 max-w-[240px] text-xs leading-relaxed text-muted-foreground">
          Create a job to schedule recurring agent prompts, or ask the agent to
          set one up for you.
        </p>
        <Button size="sm" className="mt-4" onClick={onAdd}>
          + New Job
        </Button>
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
