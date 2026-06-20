// The smart cron alarm (Phase 5). Scheduled goals are time-driven: nothing
// pushes "a minute passed", so an open workspace still needs a timer to fire a
// cron loop on schedule. To honour the no-polling rule (Principle 6, D-04) this
// is NOT a fixed-interval poll — it arms ONE timer for the single next moment any
// cron trigger is due (earliestNextFire), fires the live reconcile then, and
// re-arms for the following due moment. With no schedulable trigger it disarms
// entirely, so an idle workspace never wakes.
//
// Re-arm is also driven by state changes (the runtime calls `rearm` from
// `handleStateChange`), so adding/editing/pausing a scheduled goal resets the
// timer immediately. Missed fires while the machine slept are collapsed by the
// reconcile exactly like catch-up-on-open, and the catch-up pass on next open
// backstops anything the timer ever drops.

import type { Clock } from './clock';
import { earliestNextFire, type SchedulerLog } from './scheduler';
import type { StateStore } from './state-store';

/** Largest delay a single setTimeout can hold (~24.8 days); longer waits chunk. */
export const MAX_TIMER_DELAY_MS = 2_147_483_647;

/**
 * Injectable one-shot timer seam. `arm` REPLACES any pending timer (so re-arming
 * is idempotent); `disarm` cancels it. Tests inject a controllable fake; the
 * default uses `setTimeout`.
 */
export interface AlarmTimer {
  arm(delayMs: number, cb: () => void): void;
  disarm(): void;
}

/** Default `setTimeout`-backed timer for production. */
export function createSystemTimer(): AlarmTimer {
  let handle: ReturnType<typeof setTimeout> | null = null;
  return {
    arm(delayMs, cb) {
      if (handle) clearTimeout(handle);
      handle = setTimeout(cb, delayMs);
      // Don't keep the Electron main process alive purely for a pending cron.
      handle.unref?.();
    },
    disarm() {
      if (handle) clearTimeout(handle);
      handle = null;
    },
  };
}

export interface CronAlarmDeps {
  store: StateStore;
  clock: Clock;
  timer: AlarmTimer;
  /** The live reconcile + dispatch pass (Scheduler.tick). */
  tick: () => Promise<unknown>;
  log?: SchedulerLog;
}

export class CronAlarm {
  private disposed = false;
  // Coalesce overlapping re-arms: a request that arrives mid-rearm is folded into
  // one more pass so the final `arm` always reflects the latest loop state (a
  // stale earlier read could otherwise overwrite a fresher, sooner due time).
  private rearming = false;
  private rearmAgain = false;

  constructor(private readonly deps: CronAlarmDeps) {}

  /** Recompute the next due moment and (re)arm the single timer for it. */
  async rearm(): Promise<void> {
    if (this.disposed) return;
    if (this.rearming) {
      this.rearmAgain = true;
      return;
    }
    this.rearming = true;
    try {
      do {
        this.rearmAgain = false;
        await this.computeAndArm();
      } while (this.rearmAgain && !this.disposed);
    } finally {
      this.rearming = false;
    }
  }

  /** Stop the alarm for good (workspace closing). */
  dispose(): void {
    this.disposed = true;
    this.deps.timer.disarm();
  }

  private async computeAndArm(): Promise<void> {
    const nowMs = this.deps.clock();
    const state = await this.deps.store.read();
    if (this.disposed) return;
    const next = earliestNextFire(state.loops, new Date(nowMs));
    if (next === null) {
      this.deps.timer.disarm(); // nothing scheduled — never wake
      return;
    }
    const delay = Math.min(Math.max(0, next.getTime() - nowMs), MAX_TIMER_DELAY_MS);
    this.deps.timer.arm(delay, () => {
      void this.onFire();
    });
  }

  private async onFire(): Promise<void> {
    if (this.disposed) return;
    try {
      // tick advances lastFireAt before we recompute, so the next arm lands on a
      // strictly later due moment (no tight loop). A chunked long wait ticks with
      // nothing due — a cheap no-op reconcile — then re-arms for the remainder.
      await this.deps.tick();
    } catch (err) {
      this.deps.log?.('cron tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    await this.rearm();
  }
}
