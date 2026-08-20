import type { SpendLedger, SpendRun } from './types';

/**
 * The durable record of what indexing has spent today.
 *
 * Pure and in `shared/` because both sides need it: the runtime checks it
 * before authorising a build, and the panel shows the same number. Reading
 * `spend.usd` directly would show yesterday's total until the next build
 * happened to roll the day over.
 */

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The ledger as of `day`, with an earlier day's total cleared. */
export function ledgerForDay(ledger: SpendLedger, day: string): SpendLedger {
  return ledger.day === day ? ledger : { day, usd: 0, runs: [] };
}

export function recordRun(ledger: SpendLedger, run: SpendRun, day: string): SpendLedger {
  const rolled = ledgerForDay(ledger, day);
  return {
    day,
    usd: rolled.usd + run.usd,
    // Bounded: the ledger is a spend record for the day, not an audit log.
    runs: [...rolled.runs, run].slice(-50),
  };
}
