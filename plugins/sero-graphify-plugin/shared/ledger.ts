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

/**
 * Replace a reservation with what the build actually used.
 *
 * The reservation was already counted against the day, so the total moves by
 * the difference. A reservation that is never settled — because the build
 * failed after spending — simply stays, which is the conservative answer.
 */
export function settleRun(ledger: SpendLedger, runId: string, actual: Pick<SpendRun, 'inputTokens' | 'outputTokens' | 'usd'>): SpendLedger {
  const existing = ledger.runs.find((run) => run.id === runId);
  if (!existing) return ledger;
  return {
    ...ledger,
    usd: Math.max(0, ledger.usd - existing.usd + actual.usd),
    runs: ledger.runs.map((run) => (run.id === runId ? { ...run, ...actual, estimated: false } : run)),
  };
}
