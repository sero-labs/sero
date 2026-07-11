/**
 * CronWidget, scheduler status and upcoming jobs/reminders for the dashboard.
 *
 * Presentation is composed entirely from @sero-ai/ui dashboard components, so
 * this widget owns data and behaviour only — no ad-hoc spacing, colours or
 * hand-rolled rows.
 */

import { useEffect, useState } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import {
  ActivityList,
  ActivityListItem,
  EmptyState,
  Inline,
  Section,
  Stack,
  Status,
  Text,
  WidgetContent,
  type Tone,
} from '@sero-ai/ui';
import { CalendarClock } from 'lucide-react';
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

function reminderTone(reminder: Reminder): Tone {
  return reminder.status === 'snoozed' ? 'warning' : 'info';
}

function reminderTime(reminder: Reminder): string {
  if (reminder.status === 'snoozed' && reminder.snoozedUntil) {
    return formatRelativeTime(reminder.snoozedUntil);
  }
  if (reminder.fireAt) return formatRelativeTime(reminder.fireAt);
  if (reminder.schedule) return cronToNextLabel(reminder.schedule);
  return '';
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
  const reminders = state.reminders ?? [];
  const activeReminders = reminders.filter(
    (r) => r.status === 'active' || r.status === 'snoozed',
  );
  const recentResults = state.lastRunResults.slice(-3).reverse();
  const isEmpty = enabledJobs.length === 0 && activeReminders.length === 0;

  return (
    <WidgetContent>
      <Stack gap="sm" fill>
        <Inline justify="between" align="center">
          <Status tone={state.schedulerActive ? 'success' : 'neutral'} pulse={state.schedulerActive}>
            {state.schedulerActive ? 'Scheduler active' : 'Scheduler paused'}
          </Status>
          <Inline gap="sm">
            <Text variant="muted">{enabledJobs.length} jobs</Text>
            <Text variant="muted">{activeReminders.length} reminders</Text>
          </Inline>
        </Inline>

        {isEmpty ? (
          <EmptyState icon={CalendarClock} title="No scheduled tasks" />
        ) : (
          <Stack gap="sm" scroll>
            {enabledJobs.length > 0 && (
              <Section heading="Scheduled jobs" gap="xs">
                <ActivityList overflowCount={Math.max(0, enabledJobs.length - 3)}>
                  {enabledJobs.slice(0, 3).map((job: CronJob) => (
                    <ActivityListItem
                      key={job.name}
                      tone="info"
                      label={job.name}
                      timestamp={cronToNextLabel(job.schedule)}
                    />
                  ))}
                </ActivityList>
              </Section>
            )}

            {activeReminders.length > 0 && (
              <Section heading="Reminders" gap="xs">
                <ActivityList overflowCount={Math.max(0, activeReminders.length - 3)}>
                  {activeReminders.slice(0, 3).map((r) => (
                    <ActivityListItem
                      key={r.id}
                      tone={reminderTone(r)}
                      label={r.title}
                      timestamp={reminderTime(r)}
                    />
                  ))}
                </ActivityList>
              </Section>
            )}

            {recentResults.length > 0 && (
              <Inline gap="xs" align="center" className="mt-auto">
                <Text variant="muted">Recent</Text>
                {recentResults.map((r, i) => (
                  <Status
                    key={i}
                    tone={r.ok ? 'success' : 'error'}
                    title={`${r.jobName}: ${r.ok ? 'OK' : r.error ?? 'Failed'}`}
                  />
                ))}
              </Inline>
            )}
          </Stack>
        )}
      </Stack>
    </WidgetContent>
  );
}

export default CronWidget;
