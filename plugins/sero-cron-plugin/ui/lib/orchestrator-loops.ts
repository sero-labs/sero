/**
 * Scheduled Orchestrator loops shown in the Scheduler app.
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

/** One cron/hybrid trigger of one loop, flattened for display. */
export interface ScheduledLoopRow {
  loopId: string;
  triggerId: string;
  title: string;
  status: OrchestratorLoopStatus;
  /** 5-field cron expression, evaluated in UTC. */
  schedule: string;
  /** True for hybrid triggers, which also fire on events. */
  firesOnEvents: boolean;
  nextFireAt?: string;
  lastFireAt?: string;
  /** The schedule itself is paused (trigger disabled). */
  scheduleDisabled: boolean;
}

/** Absolute path of the Orchestrator's loop index, or null without a workspace. */
export function orchestratorIndexPath(workspacePath: string): string | null {
  return workspacePath ? `${workspacePath}/${ORCHESTRATOR_INDEX_FILE}` : null;
}

/** Flattens the watched loop index into one row per scheduled trigger. */
export function scheduledLoopRows(index: OrchestratorIndexView | null): ScheduledLoopRow[] {
  if (!index?.loops) return [];
  return index.loops.flatMap((loop) =>
    (loop.schedules ?? []).map((schedule) => ({
      loopId: loop.id,
      triggerId: schedule.triggerId,
      title: loop.title,
      status: loop.status,
      schedule: schedule.schedule,
      firesOnEvents: schedule.type === 'hybrid',
      nextFireAt: schedule.nextFireAt,
      lastFireAt: schedule.lastFireAt,
      scheduleDisabled: schedule.disabled === true,
    })),
  );
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
