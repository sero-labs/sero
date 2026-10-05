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
  /** `parentCallId` is the call that made this one, for a call a tool made while it ran. */
  start(callId: string, toolName: string, parentCallId?: string): void;
  end(callId: string): void;
  /** Stops every timer. Called when a turn ends and when the run ends. */
  clear(): void;
}

interface WatchedCall {
  toolName: string;
  parentCallId?: string;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * One stall timer for each tool call that is open.
 *
 * A reply can hold several tool calls, and they run at the same time. With one
 * shared timer, the end of a quick call cleared the timer of a call that was
 * still running, and a command that never returned was no longer watched.
 *
 * A tool can make calls of its own while it runs, as a `codemode` script does.
 * Each of those calls has its own timer, and its start and its end restart the
 * timer of the call that made it. So a script is stalled only when it has made
 * no progress for the whole period, however long it runs in total.
 */
export function createToolStallWatch(stallMs: number, onStall: (toolName: string) => void): ToolStallWatch {
  const calls = new Map<string, WatchedCall>();
  const arm = (callId: string, toolName: string): ReturnType<typeof setTimeout> =>
    setTimeout(() => { calls.delete(callId); onStall(toolName); }, stallMs);
  const restartCallers = (parentCallId: string | undefined): void => {
    for (let id = parentCallId; id !== undefined;) {
      const caller = calls.get(id);
      if (!caller) return;
      clearTimeout(caller.timer);
      caller.timer = arm(id, caller.toolName);
      id = caller.parentCallId;
    }
  };
  const end = (callId: string): void => {
    const call = calls.get(callId);
    if (!call) return;
    clearTimeout(call.timer);
    calls.delete(callId);
    restartCallers(call.parentCallId);
  };
  return {
    start(callId, toolName, parentCallId) {
      end(callId);
      if (stallMs <= 0) return; // disabled
      calls.set(callId, { toolName, parentCallId, timer: arm(callId, toolName) });
      restartCallers(parentCallId);
    },
    end,
    clear() {
      for (const call of calls.values()) clearTimeout(call.timer);
      calls.clear();
    },
  };
}
