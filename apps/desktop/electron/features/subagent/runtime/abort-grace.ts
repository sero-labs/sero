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

/** Waits for the prompt, or for the grace period after an abort, whichever ends first. */
export async function settleOrGiveUp(prompt: Promise<unknown>, grace: AbortGrace): Promise<void> {
  // The prompt may still reject after the wait has been given up. Nothing reads it then.
  prompt.catch(() => undefined);
  await Promise.race([prompt, grace.expired]);
}
