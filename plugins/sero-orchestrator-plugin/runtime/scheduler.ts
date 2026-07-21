/**
 * Trigger scheduling (D-12, FR-15/FR-16). Triggers MARK a loop due; they never
 * execute detached prompts. The coordinator still applies lifecycle, readiness,
 * locks, and limits.
 *
 * Cron uses a minimal 5-field matcher (min hour dom month dow) in UTC. Missed
 * cron fires while the workspace was closed collapse into a single catch-up run
 * by advancing nextFireAt past "now" and firing once.
 */

import type { Loop, LoopTrigger } from '../shared/types';
import type { OrchestratorHost } from './host';
import type { TriggerExtraction } from './trigger-extractor';
import { initStepStates } from './plan-mapping';
import { isValidCron, nextFireAfter, parseCron } from './cron';

// Cron parsing lives in cron.ts (pure, no deps); re-exported for existing callers.
export { isValidCron, nextFireAfter, parseCron };

// ── Trigger evaluation ──────────────────────────────────────

function fire(trigger: LoopTrigger, nowMs: number, nextFireAt?: string): LoopTrigger {
  const fireCount = trigger.fireCount + 1;
  const disabled = trigger.maxFires !== undefined && fireCount >= trigger.maxFires;
  return {
    ...trigger,
    fireCount,
    lastFireAt: new Date(nowMs).toISOString(),
    nextFireAt: disabled ? undefined : nextFireAt,
    disabled: disabled || trigger.disabled,
  };
}

/** Marks cron/hybrid triggers due when their nextFireAt has passed. Collapses missed fires. */
export function evaluateCronTriggers(loop: Loop, nowMs: number): { loop: Loop; due: boolean; triggerId?: string } {
  let due = false;
  let triggerId: string | undefined;
  const triggers = loop.triggers.map((trigger) => {
    if (trigger.disabled || trigger.scheduleDisabled) return trigger;
    if (trigger.type !== 'cron' && trigger.type !== 'hybrid') return trigger;
    if (!trigger.schedule || !trigger.nextFireAt) return trigger;
    if (Date.parse(trigger.nextFireAt) > nowMs) return trigger;
    due = true;
    triggerId ??= trigger.id;
    const next = nextFireAfter(trigger.schedule, nowMs);
    return fire(trigger, nowMs, next !== null ? new Date(next).toISOString() : undefined);
  });
  return { loop: { ...loop, triggers }, due, triggerId };
}

/**
 * A loop is recurring when something can legitimately fire it again on its own:
 * an enabled cron/hybrid trigger still scheduled to fire (a schedule and a
 * pending nextFireAt — an exhausted maxFires clears it), OR an enabled
 * event/hybrid trigger with a source (the next matching event re-runs it).
 * Once nothing can fire again, the next completion is terminal.
 */
export function isRecurring(loop: Loop): boolean {
  return loop.triggers.some(
    (t) =>
      !t.disabled &&
      (((t.type === 'cron' || t.type === 'hybrid') && !!t.schedule && !!t.nextFireAt) ||
        ((t.type === 'event' || t.type === 'hybrid') && !!t.eventSource)),
  );
}

/**
 * A loop armed PURELY by event triggers has nothing to process until an event
 * arrives — activating/enabling it must not start an eventless pass (found by
 * the live GitHub e2e: the no-event pass asked the user for the payload and
 * parked, stranding the real event in the stash). Cron/hybrid/manual triggers
 * (or none at all) keep today's run-on-activate behavior.
 */
export function isEventArmedOnly(loop: Loop): boolean {
  const enabled = loop.triggers.filter((t) => !t.disabled);
  return enabled.length > 0 && enabled.every((t) => t.type === 'event');
}

/**
 * Resets a loop for a fresh scheduled iteration: all steps back to pending, run
 * context (variables/completion/block/active run) cleared, and the resolved
 * workspace cleared so the next run resolves a clean worktree. The plan, triggers,
 * limits, and run history are kept.
 */
export function rearmLoop(loop: Loop, now: string): Loop {
  return {
    ...loop,
    runtime: {
      ...loop.runtime,
      stepStates: initStepStates(loop.plan, now),
      variables: {},
      completion: undefined,
      block: undefined,
      activeRunId: undefined,
      dueAgain: false,
      snoozedUntil: undefined,
      pendingTriggerId: undefined,
      feedbackStates: undefined,
      workspace: {},
    },
    updatedAt: now,
  };
}

/**
 * Re-enables a loop's cron/hybrid triggers that were disabled when it completed,
 * re-arming nextFireAt from now. Used by "run again" so a finished scheduled loop
 * resumes its schedule.
 */
export function reenableSchedule(loop: Loop, now: string): LoopTrigger[] {
  const nowMs = Date.parse(now);
  return loop.triggers.map((t) => {
    if ((t.type === 'cron' || t.type === 'hybrid') && t.disabled && t.schedule) {
      const next = nextFireAfter(t.schedule, nowMs);
      return { ...t, disabled: false, nextFireAt: next !== null ? new Date(next).toISOString() : undefined };
    }
    return t;
  });
}

/** True once a trigger has fired its declared maxFires — it will never fire again. */
export function isExhausted(trigger: LoopTrigger): boolean {
  return trigger.maxFires !== undefined && trigger.fireCount >= trigger.maxFires;
}

/**
 * Direct user edit of one cron/hybrid trigger's schedule (set_schedule action —
 * e.g. from the Scheduler app): validates the cron expression, applies the new
 * schedule and/or paused state, and re-arms nextFireAt from now (cleared while
 * paused). The paused state maps to `scheduleDisabled`, not `disabled`, so a
 * hybrid trigger paused here keeps firing on its events — only its cron schedule
 * pauses. Event triggers have no schedule and are rejected; a trigger that is
 * fully off (loop complete/disabled, or maxFires exhausted) can't be re-armed
 * from here and is rejected — the loop must be restarted in Orchestrator.
 */
export function applyScheduleOverride(
  loop: Loop,
  triggerId: string,
  override: { schedule?: string; disabled?: boolean },
  now: string,
): { ok: boolean; loop?: Loop; error?: string } {
  const index = loop.triggers.findIndex((t) => t.id === triggerId);
  if (index === -1) return { ok: false, error: `Trigger not found: ${triggerId}` };
  const trigger = loop.triggers[index];
  if (trigger.type !== 'cron' && trigger.type !== 'hybrid') {
    return { ok: false, error: `Trigger ${triggerId} is "${trigger.type}" — only cron/hybrid triggers have a schedule.` };
  }
  if (trigger.disabled) {
    const why = isExhausted(trigger)
      ? `has reached its run limit (${trigger.fireCount}/${trigger.maxFires})`
      : 'belongs to a loop that is complete or turned off';
    return { ok: false, error: `Trigger ${triggerId} ${why} — restart or re-enable the loop in Orchestrator to run it again.` };
  }
  const schedule = override.schedule ?? trigger.schedule;
  if (!schedule) return { ok: false, error: 'A cron schedule is required.' };
  if (!isValidCron(schedule)) {
    return { ok: false, error: `Invalid cron schedule: "${schedule}" (5 fields: minute hour day-of-month month day-of-week, UTC).` };
  }
  const scheduleDisabled = override.disabled ?? trigger.scheduleDisabled ?? false;
  // The trigger is live (guarded above), so arm the next fire unless it's paused.
  const next = scheduleDisabled ? null : nextFireAfter(schedule, Date.parse(now));
  const triggers = [...loop.triggers];
  triggers[index] = {
    ...trigger,
    schedule,
    scheduleDisabled,
    nextFireAt: next !== null ? new Date(next).toISOString() : undefined,
  };
  return { ok: true, loop: { ...loop, triggers, updatedAt: now } };
}

/**
 * Re-applies goal-derived triggers to a loop's EXISTING triggers without
 * resetting run history (used when a refinement changes the goal's cadence or
 * events): an existing cron/hybrid trigger keeps its fireCount/lastFireAt but
 * adopts the new schedule and re-arms nextFireAt; if the goal newly recurs and
 * no cron trigger exists, one is added; extracted events whose source has no
 * trigger yet are appended fresh. Nothing is removed — refine never silently
 * strips a loop's triggers.
 */
export function reapplyExtractedTriggers(
  host: OrchestratorHost,
  loopId: string,
  triggers: LoopTrigger[],
  extraction: TriggerExtraction,
): LoopTrigger[] {
  let updated = triggers;

  if (extraction.recurring && extraction.schedule) {
    const next = nextFireAfter(extraction.schedule, Date.parse(host.now()));
    const nextFireAt = next !== null ? new Date(next).toISOString() : undefined;
    const index = updated.findIndex((t) => t.type === 'cron' || t.type === 'hybrid');
    if (index === -1) {
      updated = [
        ...updated,
        {
          id: host.newId('trigger'),
          loopId,
          workspaceId: host.workspaceId,
          type: 'cron',
          schedule: extraction.schedule,
          maxFires: extraction.maxFires,
          fireCount: 0,
          nextFireAt,
        },
      ];
    } else if (updated[index].schedule !== extraction.schedule) {
      updated = [...updated];
      updated[index] = { ...updated[index], schedule: extraction.schedule, nextFireAt, disabled: false };
    }
  }

  const newEvents = extraction.events.filter(
    (event) => !updated.some((trigger) => trigger.eventSource === event.eventSource),
  );
  if (newEvents.length > 0) {
    updated = [
      ...updated,
      ...newEvents.map(
        (event): LoopTrigger => ({
          id: host.newId('trigger'),
          loopId,
          workspaceId: host.workspaceId,
          type: 'event',
          fireCount: 0,
          ...event,
        }),
      ),
    ];
  }
  return updated;
}

/**
 * Records event fires on the named triggers: bumps fireCount/lastFireAt and
 * self-disables at maxFires via `fire()`. WHICH triggers fire is decided by the
 * caller (code match in event-match.ts + the model-judged condition); this only
 * applies the bookkeeping.
 */
export function applyEventFires(loop: Loop, triggerIds: string[], nowMs: number): Loop {
  if (triggerIds.length === 0) return loop;
  const ids = new Set(triggerIds);
  const triggers = loop.triggers.map((trigger) => (ids.has(trigger.id) ? fire(trigger, nowMs, trigger.nextFireAt) : trigger));
  return { ...loop, triggers };
}
