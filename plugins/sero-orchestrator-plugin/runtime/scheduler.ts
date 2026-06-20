// Cron scheduling for the orchestrator. Two entry points share one reconcile
// pass (D-02):
//
//   • catchUpOnOpen() — runs ONCE per open (Phase 2.5, D-04). With no always-on
//     watcher, nothing records a cron fire while a workspace is closed, so on
//     start the scheduler recomputes each cron trigger's missed fires from
//     `lastFireAt` + `schedule`, collapses any number of missed fires into a
//     SINGLE catch-up per loop, and enqueues one `run_next` per due loop. Event
//     triggers that fired while closed are missed (no listener existed) — logged,
//     never silent.
//
//   • tick(now) — the open-workspace live pass (Phase 5). Driven by the
//     smart-alarm (alarm.ts), which arms a single timer for the NEXT due minute
//     (earliestNextFire) and re-arms after each fire — not a fixed-interval poll
//     (Principle 6 / no-polling). When it fires, this reconcile marks cron loops
//     due exactly as catch-up does (collapse + advance lastFireAt, so a loop
//     never fires twice), then dispatches them.
//
// Both paths advance the debounce in ONE atomic mutation (single-writer) and
// dispatch through the gated `run_next` path (per-loop lock + stop rule apply).

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

/** A cron trigger that can still fire (enabled, schedule present, under maxFires). */
function isArmableCron(trigger: LoopTrigger): boolean {
  if (!isCronTrigger(trigger)) return false;
  return trigger.maxFires === undefined || trigger.fireCount < trigger.maxFires;
}

/**
 * The earliest moment any active loop's cron trigger is next scheduled to fire,
 * or null when nothing is schedulable. Pure and read-only — the smart-alarm uses
 * it to arm ONE timer for the next due minute instead of polling (Phase 5). A
 * trigger already overdue (its next fire is in the past) reports that past time,
 * so the alarm fires promptly and the reconcile collapses the miss.
 */
export function earliestNextFire(loops: LoopGoal[], now: Date): Date | null {
  let earliest: number | null = null;
  for (const loop of loops) {
    if (loop.status !== 'active') continue;
    for (const trigger of loop.triggers) {
      if (!isArmableCron(trigger)) continue;
      let cron;
      try {
        cron = compileCron(trigger.schedule!);
      } catch {
        continue; // malformed schedule — never arm on it
      }
      const anchor = new Date(trigger.lastFireAt ?? loop.createdAt);
      const next = nextFireAfter(cron, anchor);
      if (next === null) continue;
      const ms = next.getTime();
      if (earliest === null || ms < earliest) earliest = ms;
    }
  }
  return earliest === null ? null : new Date(earliest);
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

  private get log(): SchedulerLog {
    return this.deps.log ?? defaultLog;
  }

  /**
   * Reconcile every active loop's cron triggers once, persist the advanced
   * debounce in a single atomic mutation (single-writer), then enqueue one
   * `run_next` per due loop. Returns after the reconcile + dispatch; the runs
   * themselves complete asynchronously (await `report.settled` to observe them).
   *
   * Catch-up wording: due fires are ones missed while the workspace was closed,
   * and event triggers that fired while closed are unobservable — logged here.
   */
  async catchUpOnOpen(): Promise<CatchUpReport> {
    const { dueLoopIds, missedEventTriggers } = await this.reconcile();
    if (missedEventTriggers > 0) {
      this.log('event triggers cannot be caught up while closed (no listener existed)', {
        missedEventTriggers,
      });
    }
    if (dueLoopIds.length > 0) {
      this.log('running catch-up for cron loops due while closed', { dueLoopIds });
    }
    return { dueLoopIds, missedEventTriggers, settled: this.dispatch(dueLoopIds) };
  }

  /**
   * The open-workspace live pass (Phase 5), driven by the smart-alarm. Same
   * reconcile as catch-up — collapse missed minutes, advance `lastFireAt` so a
   * loop never fires twice — but the fires are happening now, not recovered, so
   * the missed-event log is skipped.
   */
  async tick(): Promise<CatchUpReport> {
    const { dueLoopIds, missedEventTriggers } = await this.reconcile();
    if (dueLoopIds.length > 0) {
      this.log('running cron loops due now', { dueLoopIds });
    }
    return { dueLoopIds, missedEventTriggers, settled: this.dispatch(dueLoopIds) };
  }

  /**
   * Advance every active loop's cron debounce in ONE atomic mutation
   * (single-writer) and collect which loops are due plus how many while-closed
   * event fires were missed. Does not dispatch.
   */
  private async reconcile(): Promise<{ dueLoopIds: string[]; missedEventTriggers: number }> {
    const now = new Date(this.deps.clock());
    const dueLoopIds: string[] = [];
    let missedEventTriggers = 0;

    await this.deps.store.mutate((state: OrchestratorState) => {
      for (const loop of state.loops) {
        if (loop.status !== 'active') continue; // only runnable loops reconcile
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

    return { dueLoopIds, missedEventTriggers };
  }

  /** Enqueue one gated `run_next` per due loop; resolves when all settle. */
  private dispatch(dueLoopIds: string[]): Promise<void> {
    const runs = dueLoopIds.map((loopId) =>
      this.deps.runLoop(loopId).catch((err) => {
        this.log('cron run failed', {
          loopId,
          error: err instanceof Error ? err.message : String(err),
        });
      }),
    );
    return Promise.allSettled(runs).then(() => undefined);
  }
}
