// Catch-up-on-open scheduling (Phase 2.5, D-04). There is no always-on watcher:
// a workspace coordinator is the only executor, so nothing records a cron fire
// while a workspace is closed. Instead, when the runtime starts, the scheduler
// recomputes each cron trigger's missed fires from `lastFireAt` + `schedule`,
// collapses any number of missed fires into a SINGLE catch-up per loop, and
// enqueues one `run_next` per due loop through the coordinator (which still gates
// on the per-loop lock and stop rule). Event triggers that fired while the
// workspace was closed are missed — no listener existed — and are logged, never
// silent.
//
// This runs ONCE per open (a state transition), never on an interval
// (Principle 6 / no-polling). The live per-minute cron tick and event
// subscriptions are Phase 5.

import type { LoopGoal, LoopTrigger, OrchestratorState } from '../shared/types';
import { isoNow, type Clock } from './clock';
import { compileCron, nextFireAfter } from './cron';
import type { StateStore } from './state-store';

/** Cron-schedulable triggers carry a schedule; `hybrid` adds an event safety net. */
function isCronTrigger(trigger: LoopTrigger): boolean {
  return (
    !trigger.disabled &&
    Boolean(trigger.schedule) &&
    (trigger.type === 'cron' || trigger.type === 'hybrid')
  );
}

/** Event-driven triggers whose while-closed fires are unobservable (logged only). */
function isEventTrigger(trigger: LoopTrigger): boolean {
  return !trigger.disabled && (trigger.type === 'event' || trigger.type === 'hybrid');
}

export interface LoopReconcile {
  /** The loop's triggers with cron debounce advanced (fresh array on any change). */
  triggers: LoopTrigger[];
  /** Whether any trigger's persisted state changed (drives an `updatedAt` bump). */
  changed: boolean;
  /** Whether the loop is due for a single catch-up run this open. */
  due: boolean;
  /** Count of enabled event/hybrid triggers whose while-closed fires were missed. */
  missedEventTriggers: number;
}

/**
 * Pure reconcile for one loop at `now`: advance each cron trigger's debounce and
 * decide whether the loop is due for a single catch-up. A trigger is due when the
 * next scheduled minute after its anchor (`lastFireAt`, or the loop's creation
 * time on first arm) is already in the past — which collapses any number of
 * missed minutes into one. Disabled, exhausted (`maxFires`), and
 * malformed-schedule triggers are skipped without firing.
 */
export function reconcileLoop(loop: LoopGoal, now: Date): LoopReconcile {
  const nowMs = now.getTime();
  let due = false;
  let changed = false;
  let missedEventTriggers = 0;

  const triggers = loop.triggers.map((trigger) => {
    if (isEventTrigger(trigger)) missedEventTriggers += 1;
    if (!isCronTrigger(trigger)) return trigger;
    if (trigger.maxFires !== undefined && trigger.fireCount >= trigger.maxFires) return trigger;

    let cron;
    try {
      cron = compileCron(trigger.schedule!);
    } catch {
      return trigger; // malformed schedule — skip, never crash the open
    }

    const anchor = new Date(trigger.lastFireAt ?? loop.createdAt);
    const dueTime = nextFireAfter(cron, anchor);
    const fired = dueTime !== null && dueTime.getTime() <= nowMs;

    if (fired) {
      due = true;
      changed = true;
      return {
        ...trigger,
        fireCount: trigger.fireCount + 1,
        lastFireAt: now.toISOString(),
        nextFireAt: nextFireAfter(cron, now)?.toISOString(),
      };
    }

    // Not due — keep the anchor; only refresh the cached next-due for the UI.
    const nextIso = dueTime?.toISOString();
    if (nextIso === trigger.nextFireAt) return trigger;
    changed = true;
    return { ...trigger, nextFireAt: nextIso };
  });

  return { triggers, changed, due, missedEventTriggers };
}

export type SchedulerLog = (message: string, detail?: Record<string, unknown>) => void;

const defaultLog: SchedulerLog = (message, detail) => {
  // Electron-main console → the dev/electron log; "logged, never silent" (D-04).
  console.info(`[orchestrator:scheduler] ${message}`, detail ?? {});
};

export interface SchedulerDeps {
  store: StateStore;
  clock: Clock;
  /** Enqueue a catch-up run for a due loop; gated by the coordinator (D-01). */
  runLoop: (loopId: string) => Promise<unknown>;
  log?: SchedulerLog;
}

export interface CatchUpReport {
  /** Loops marked due and dispatched to `run_next` this open. */
  dueLoopIds: string[];
  /** Active loops' event/hybrid triggers whose while-closed fires were missed. */
  missedEventTriggers: number;
  /** Resolves when every dispatched run settles — tests await this; `start()` does not. */
  settled: Promise<void>;
}

export class Scheduler {
  constructor(private readonly deps: SchedulerDeps) {}

  /**
   * Reconcile every active loop's cron triggers once, persist the advanced
   * debounce in a single atomic mutation (single-writer), then enqueue one
   * `run_next` per due loop. Returns after the reconcile + dispatch; the runs
   * themselves complete asynchronously (await `report.settled` to observe them).
   */
  async catchUpOnOpen(): Promise<CatchUpReport> {
    const log = this.deps.log ?? defaultLog;
    const now = new Date(this.deps.clock());
    const dueLoopIds: string[] = [];
    let missedEventTriggers = 0;

    await this.deps.store.mutate((state: OrchestratorState) => {
      for (const loop of state.loops) {
        if (loop.status !== 'active') continue; // only runnable loops catch up
        const result = reconcileLoop(loop, now);
        missedEventTriggers += result.missedEventTriggers;
        if (result.changed) {
          loop.triggers = result.triggers;
          loop.updatedAt = isoNow(this.deps.clock);
        }
        if (result.due) dueLoopIds.push(loop.id);
      }
      return null;
    });

    if (missedEventTriggers > 0) {
      log('event triggers cannot be caught up while closed (no listener existed)', {
        missedEventTriggers,
      });
    }
    if (dueLoopIds.length > 0) {
      log('running catch-up for cron loops due while closed', { dueLoopIds });
    }

    const runs = dueLoopIds.map((loopId) =>
      this.deps.runLoop(loopId).catch((err) => {
        log('catch-up run failed', {
          loopId,
          error: err instanceof Error ? err.message : String(err),
        });
      }),
    );

    return {
      dueLoopIds,
      missedEventTriggers,
      settled: Promise.allSettled(runs).then(() => undefined),
    };
  }
}
