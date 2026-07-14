/**
 * Scheduled and one-off snoozed Orchestrator loops shown in Scheduler.
 *
 * The Orchestrator (workspace-scoped) maintains a watched loop index whose
 * entries carry a compact schedule summary; this module maps that index into
 * flat display rows. Pure — the file watching and tool calls live elsewhere.
 */

import type {
  OrchestratorIndexView,
  OrchestratorLoopStatus,
} from '@sero-ai/common';
import { ORCHESTRATOR_INDEX_FILE } from '@sero-ai/common';

interface LoopRowBase {
  loopId: string;
  title: string;
  status: OrchestratorLoopStatus;
  snoozedUntil?: string;
}

/** One cron/hybrid trigger of one loop, flattened for display. */
export interface ScheduledTriggerRow extends LoopRowBase {
  kind: 'schedule';
  triggerId: string;
  /** 5-field cron expression, evaluated in UTC. */
  schedule: string;
  /** True for hybrid triggers, which also fire on events. */
  firesOnEvents: boolean;
  nextFireAt?: string;
  lastFireAt?: string;
  /** The user paused the cron schedule (resumable); events still fire on hybrid triggers. */
  scheduleDisabled: boolean;
  /** The trigger hit its run limit (maxFires) — done for good, not resumable. */
  exhausted: boolean;
}

/** A one-off retry with no cron/hybrid schedule of its own. */
export interface SnoozedLoopRow extends LoopRowBase {
  kind: 'snooze';
  snoozedUntil: string;
}

export type ScheduledLoopRow = ScheduledTriggerRow | SnoozedLoopRow;

/** Absolute path of the Orchestrator's loop index, or null without a workspace. */
export function orchestratorIndexPath(workspacePath: string): string | null {
  return workspacePath ? `${workspacePath}/${ORCHESTRATOR_INDEX_FILE}` : null;
}

/** Flattens the watched loop index into one row per scheduled trigger. */
export function scheduledLoopRows(index: OrchestratorIndexView | null): ScheduledLoopRow[] {
  if (!index?.loops) return [];
  const rows: ScheduledLoopRow[] = [];
  for (const loop of index.loops) {
    const schedules = loop.schedules ?? [];
    for (const schedule of schedules) {
      rows.push({
        kind: 'schedule',
        loopId: loop.id,
        triggerId: schedule.triggerId,
        title: loop.title,
        status: loop.status,
        schedule: schedule.schedule,
        firesOnEvents: schedule.type === 'hybrid',
        nextFireAt: schedule.nextFireAt,
        lastFireAt: schedule.lastFireAt,
        snoozedUntil: loop.snoozedUntil,
        scheduleDisabled: schedule.paused === true,
        exhausted: schedule.exhausted === true,
      });
    }
    if (schedules.length === 0 && loop.snoozedUntil) {
      rows.push({
        kind: 'snooze',
        loopId: loop.id,
        title: loop.title,
        status: loop.status,
        snoozedUntil: loop.snoozedUntil,
      });
    }
  }
  return rows;
}

/** Formats an ISO timestamp as a short local date-time for the next/last fire. */
export function formatFireTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
