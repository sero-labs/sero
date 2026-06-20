// A pluggable clock so the coordinator's time-dependent logic (attempt
// timestamps, wall-clock budget accounting) is deterministic under test. The
// engine reads time only through this seam — never `Date.now()` directly — so a
// test can advance a fake clock to simulate a long-running attempt.

export type Clock = () => number;

export const systemClock: Clock = () => Date.now();

/** ISO-8601 timestamp from the injected clock. */
export function isoNow(clock: Clock): string {
  return new Date(clock()).toISOString();
}
