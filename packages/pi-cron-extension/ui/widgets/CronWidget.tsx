/**
 * CronWidget — scheduler status and upcoming jobs/reminders for the dashboard.
 *
 * Shows scheduler status light, next firing jobs with countdown,
 * and active reminders as a compact stack.
 */

import { useEffect, useState } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import type { CronState, CronJob, Reminder } from '../../shared/types';
import { DEFAULT_CRON_STATE } from '../../shared/types';
import '../styles.css';

// ── Helpers ──────────────────────────────────────────────────────

function cronToNextLabel(schedule: string): string {
  // Simplified: show the raw cron expression nicely
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return schedule;
  const [min, hour] = parts;
  if (min !== '*' && hour !== '*') return `${hour}:${min.padStart(2, '0')}`;
  if (min !== '*') return `Every hour at :${min.padStart(2, '0')}`;
  return schedule;
}

function formatRelativeTime(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff < 0) return 'overdue';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// ── Component ────────────────────────────────────────────────────

export function CronWidget() {
  const [state] = useAppState<CronState>(DEFAULT_CRON_STATE);
  const [, setTick] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTick((tick) => tick + 1);
    }, 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  const enabledJobs = state.jobs.filter((j) => !j.disabled);
  const activeReminders = state.reminders.filter((r) => r.status === 'active' || r.status === 'snoozed');
  const recentResults = state.lastRunResults.slice(-3).reverse();

  const isEmpty = enabledJobs.length === 0 && activeReminders.length === 0;

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      {/* ── Status header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="size-2 rounded-full"
            style={{
              backgroundColor: state.schedulerActive ? '#22c55e' : '#6b7280',
              boxShadow: state.schedulerActive ? '0 0 8px rgba(34, 197, 94, 0.5)' : undefined,
            }}
          />
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {state.schedulerActive ? 'Scheduler active' : 'Scheduler paused'}
          </span>
        </div>
        <div className="flex gap-2 text-[10px] tabular-nums text-[var(--text-muted)]">
          <span>{enabledJobs.length} jobs</span>
          <span>{activeReminders.length} reminders</span>
        </div>
      </div>

      {isEmpty ? (
        <EmptyCron />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
          {/* ── Jobs ── */}
          {enabledJobs.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Scheduled Jobs
              </span>
              {enabledJobs.slice(0, 3).map((job) => (
                <JobRow key={job.name} job={job} />
              ))}
              {enabledJobs.length > 3 && (
                <span className="text-[10px] text-[var(--text-muted)]">
                  +{enabledJobs.length - 3} more
                </span>
              )}
            </div>
          )}

          {/* ── Reminders ── */}
          {activeReminders.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Reminders
              </span>
              {activeReminders.slice(0, 3).map((r) => (
                <ReminderRow key={r.id} reminder={r} />
              ))}
              {activeReminders.length > 3 && (
                <span className="text-[10px] text-[var(--text-muted)]">
                  +{activeReminders.length - 3} more
                </span>
              )}
            </div>
          )}

          {/* ── Recent runs sparkline ── */}
          {recentResults.length > 0 && (
            <div className="mt-auto flex items-center gap-1">
              <span className="text-[9px] text-[var(--text-muted)]">Recent:</span>
              {recentResults.map((r, i) => (
                <div
                  key={i}
                  className="size-2 rounded-full"
                  style={{ backgroundColor: r.ok ? '#22c55e' : '#dc2626' }}
                  title={`${r.jobName}: ${r.ok ? 'OK' : r.error ?? 'Failed'}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function JobRow({ job }: { job: CronJob }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-[var(--bg-elevated)] px-2 py-1.5">
      <div className="size-1.5 shrink-0 rounded-full bg-indigo-400" />
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-primary)]">
        {job.name}
      </span>
      <span className="shrink-0 rounded bg-[var(--bg-surface)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--text-muted)]">
        {cronToNextLabel(job.schedule)}
      </span>
    </div>
  );
}

function ReminderRow({ reminder }: { reminder: Reminder }) {
  const isSnoozed = reminder.status === 'snoozed';
  const timeLabel = isSnoozed && reminder.snoozedUntil
    ? formatRelativeTime(reminder.snoozedUntil)
    : reminder.fireAt
      ? formatRelativeTime(reminder.fireAt)
      : reminder.schedule
        ? cronToNextLabel(reminder.schedule)
        : '';

  return (
    <div className="flex items-center gap-2 rounded-md bg-[var(--bg-elevated)] px-2 py-1.5">
      <div
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: isSnoozed ? '#f59e0b' : '#8b5cf6' }}
      />
      <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-primary)]">
        {reminder.title}
      </span>
      {timeLabel && (
        <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">
          {timeLabel}
        </span>
      )}
    </div>
  );
}

function EmptyCron() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2">
      <div className="relative size-10">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500/15 to-cyan-500/15" />
        <svg viewBox="0 0 40 40" className="absolute inset-0 size-10">
          <circle
            cx="20"
            cy="20"
            r="14"
            fill="none"
            stroke="var(--border-default)"
            strokeWidth="1.5"
          />
          <line
            x1="20" y1="20" x2="20" y2="10"
            stroke="var(--text-muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <line
            x1="20" y1="20" x2="27" y2="20"
            stroke="var(--text-muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="20" cy="20" r="1.5" fill="var(--text-muted)" />
        </svg>
      </div>
      <span className="text-xs text-[var(--text-muted)]">No scheduled tasks</span>
    </div>
  );
}

export default CronWidget;
