/**
 * The limit on how long a run may outlive its own abort.
 *
 * A run is aborted when it passes its time limit or when one tool call stalls.
 * The abort asks the session to stop, and the runner then waits for the prompt
 * to settle. A tool that does not end on abort (a shell command that started a
 * server and still holds its output open) never lets it settle, and the run,
 * the Workflow step and everything waiting on it stay open for good.
 *
 * So the wait has a limit of its own. Once an abort is sent, the prompt has
 * this long to settle. After that the runner stops waiting, reports the stop
 * reason, and disposes the session.
 */

export const ABORT_GRACE_MS = 15_000;

export interface AbortGrace {
  /** Resolves when the grace period after an abort has passed. */
  expired: Promise<void>;
  /** Starts the grace period. A second call does not restart it. */
  start(): void;
  clear(): void;
}

export function createAbortGrace(graceMs: number = ABORT_GRACE_MS): AbortGrace {
  let expire: () => void = () => {};
  const expired = new Promise<void>((resolve) => { expire = resolve; });
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    expired,
    start: () => { timer ??= setTimeout(expire, graceMs); },
    clear: () => { if (timer) clearTimeout(timer); },
  };
}

/** Returned when a bounded step was given up after an abort did not settle it. */
export const GAVE_UP = Symbol('gave-up');

/**
 * Awaits the work, or the grace period after an abort, whichever ends first.
 * Returns `GAVE_UP` when the grace won, so the caller can report the stop
 * instead of waiting for work that may never settle.
 */
export async function raceGrace<T>(work: Promise<T>, grace: AbortGrace): Promise<T | typeof GAVE_UP> {
  // The work may still reject after the wait has been given up. Nothing reads it then.
  work.catch(() => undefined);
  const gaveUp: Promise<typeof GAVE_UP> = grace.expired.then((): typeof GAVE_UP => GAVE_UP);
  return Promise.race([work, gaveUp]);
}

/** Waits for the prompt, or for the grace period after an abort, whichever ends first. */
export async function settleOrGiveUp(prompt: Promise<unknown>, grace: AbortGrace): Promise<void> {
  await raceGrace(prompt, grace);
}

export interface ToolStallWatch {
  start(callId: string, toolName: string): void;
  end(callId: string): void;
  /** Stops every timer. Called when a turn ends and when the run ends. */
  clear(): void;
}

/**
 * One stall timer for each tool call that is open.
 *
 * A reply can hold several tool calls, and they run at the same time. With one
 * shared timer, the end of a quick call cleared the timer of a call that was
 * still running, and a command that never returned was no longer watched.
 */
export function createToolStallWatch(stallMs: number, onStall: (toolName: string) => void): ToolStallWatch {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const end = (callId: string): void => {
    const timer = timers.get(callId);
    if (timer) clearTimeout(timer);
    timers.delete(callId);
  };
  return {
    start(callId, toolName) {
      end(callId);
      if (stallMs <= 0) return; // disabled
      timers.set(callId, setTimeout(() => { timers.delete(callId); onStall(toolName); }, stallMs));
    },
    end,
    clear() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}
