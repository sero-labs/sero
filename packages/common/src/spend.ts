/**
 * How a spend reads against the limit it is measured by.
 *
 * One rule for every surface that shows a figure against a cap — a project, a
 * Room and a single member — because two screens disagreeing about whether
 * something is at its limit is worse than either one being wrong on its own.
 */

export type SpendTone = 'ok' | 'warn' | 'err' | 'none';

/** Green under 80% of the cap, amber from 80%, red at the cap. No cap is toneless. */
export function spendTone(spentUsd: number, capUsd: number | null): SpendTone {
  if (capUsd === null || capUsd <= 0) return 'none';
  const ratio = spentUsd / capUsd;
  if (ratio >= 1) return 'err';
  if (ratio >= 0.8) return 'warn';
  return 'ok';
}

/** How much of the cap is used, clamped so a ring can never overdraw itself. */
export function spendRatio(spentUsd: number, capUsd: number | null): number {
  if (capUsd === null || capUsd <= 0) return 0;
  return Math.min(1, spentUsd / capUsd);
}
