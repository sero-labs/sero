/**
 * Stall recovery for an owner turn. The old rule stopped any turn 10 minutes
 * after it began, however busy it was. This one measures silence: every event
 * the session emits (tool calls, results, text) restarts a single timer, so a
 * turn that keeps working may run as long as it likes.
 *
 * A turn silent for the stall window is steered once to save its work and
 * settle. Still silent after the grace period, it is aborted and reported as
 * an interruption by the caller. The user's own limits (project cost cap and
 * the like) are not handled here and are checked exactly as before.
 */

import { OWNER_STALL_GRACE_MS, OWNER_STALL_WINDOW_MS } from '../shared/stall-limits';

export { OWNER_STALL_GRACE_MS, OWNER_STALL_WINDOW_MS };

export const OWNER_STALL_STEER = 'You have shown no activity for a while. Checkpoint now: save what you have done to the project record, then end this turn by declaring an outcome (sleep, continue, decide or blocked). Do not start new work in this turn.';

export interface StallWatch {
  /** Any session event: progress, so the silence timer starts over. */
  touch(): void;
  /** Ends the watch; no callback fires after it. */
  stop(): void;
}

export interface StallWatchOptions {
  windowMs?: number;
  graceMs?: number;
  /** The first silence: ask the owner to checkpoint and settle. */
  steer(): void;
  /** Silence continued after the steer: stop the turn. */
  stalled(): void;
}

/** One timer, re-armed by events. No polling. The steer happens at most once per watch. */
export function watchStall(options: StallWatchOptions): StallWatch {
  const windowMs = options.windowMs ?? OWNER_STALL_WINDOW_MS;
  const graceMs = options.graceMs ?? OWNER_STALL_GRACE_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let steered = false;
  let stopped = false;
  const arm = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, steered ? graceMs : windowMs);
  };
  const fire = (): void => {
    if (stopped) return;
    if (!steered) {
      steered = true;
      options.steer();
      arm();
      return;
    }
    stopped = true;
    options.stalled();
  };
  arm();
  return {
    touch: () => { if (!stopped) arm(); },
    stop: () => { stopped = true; if (timer) clearTimeout(timer); },
  };
}
