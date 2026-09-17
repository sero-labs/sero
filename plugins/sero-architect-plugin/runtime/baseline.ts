/**
 * Efficiency baseline records (spec architect-run-observability).
 *
 * Task 5.4 requires a bounded baseline for one implementation-and-independent-
 * review objective and one collaborative-planning objective, measured with the
 * metrics this change adds, before any efficiency guidance changes.
 *
 * The record shape is built here so the measurement is reproducible and cannot
 * be quietly widened. One rule is enforced rather than documented: a record
 * built from synthetic data is an instrumentation check and is never evidence
 * about model efficiency. `isEfficiencyEvidence` refuses it.
 */

import type { ConfigurationProvenance } from './trace-summary';

/** The two objectives the evaluation must cover. */
export type BaselineObjective = 'implementation-and-independent-review' | 'collaborative-planning';

/** Where the numbers came from. Only `live` can support a claim about efficiency. */
export type BaselineEvidence = 'live' | 'synthetic';

export interface BaselineRecord {
  /** The objective under test, named exactly. */
  candidate: string;
  objective: BaselineObjective;
  /** The models that actually ran, and where each selection came from. */
  models: ConfigurationProvenance[];
  /** The acceptance criteria held constant across the comparison. */
  acceptanceCriteria: string[];
  cost: {
    /** Charged to this run, including usage with aggregate-only coverage. */
    attributableUsd: number;
    /** The subset of the above whose coverage is a bare total. */
    aggregateOnlyUsd: number;
    /** How much of the run is described by measured calls. */
    coverage: 'call' | 'partial' | 'aggregate';
    /** True when anything about the cost is unknown. */
    incomplete: boolean;
  };
  time: {
    elapsedMs: number;
    /** Union of observed active intervals. */
    activeMs: number;
    /** Summed worker durations, which counts parallel work more than once. */
    workerMs: number;
    waitMs: number;
  };
  counters: {
    agents: number;
    turns: number;
    requests: number;
    toolCalls: number;
    retries: number;
    compactions: number;
  };
  outcome: 'accepted' | 'rejected' | 'incomplete';
  /** The bounded spend ceiling approved for this evaluation, in USD. */
  budgetUsd: number;
  evidence: BaselineEvidence;
  recordedAt: string;
}

/**
 * True only for a live measurement with an accepted outcome.
 *
 * A synthetic record proves the instrumentation works. It says nothing about
 * whether one model or strategy is cheaper, and treating it as proof would be
 * the exact error the change is written to avoid.
 */
export function isEfficiencyEvidence(record: BaselineRecord): boolean {
  return record.evidence === 'live' && record.outcome !== 'incomplete';
}

/** Why a record cannot be used as evidence, for a report that has to say so. */
export function baselineEvidenceGap(record: BaselineRecord): string | null {
  if (record.evidence === 'synthetic') {
    return 'Synthetic data checks the instrumentation only. It is not evidence about model efficiency.';
  }
  if (record.outcome === 'incomplete') return 'The run did not reach an accepted outcome, so it cannot be compared.';
  if (record.cost.incomplete) return 'The cost is incomplete, so a saving cannot be claimed from it.';
  return null;
}

/**
 * Compares two records for the same objective and the same acceptance criteria.
 * It reports what changed and what stayed unknown; it never turns a missing
 * measurement into an improvement.
 */
export interface BaselineComparison {
  objective: BaselineObjective;
  /** True when the two records held the same criteria, so a comparison is fair. */
  comparable: boolean;
  deltas: {
    attributableUsd: number;
    activeMs: number;
    waitMs: number;
    requests: number;
    retries: number;
  };
  /** What the comparison cannot support. */
  unknowns: string[];
}

export function compareBaselines(before: BaselineRecord, after: BaselineRecord): BaselineComparison {
  const comparable = before.objective === after.objective
    && before.acceptanceCriteria.join('|') === after.acceptanceCriteria.join('|');
  const unknowns: string[] = [];
  if (!comparable) unknowns.push('The two records do not share an objective and acceptance criteria.');
  if (before.evidence !== 'live' || after.evidence !== 'live') unknowns.push('At least one record is synthetic.');
  if (before.cost.incomplete || after.cost.incomplete) unknowns.push('At least one record has incomplete cost coverage.');
  if (before.models.length === 0 || after.models.length === 0) unknowns.push('At least one record names no model, so a model change cannot be attributed.');

  return {
    objective: before.objective,
    comparable,
    deltas: {
      attributableUsd: after.cost.attributableUsd - before.cost.attributableUsd,
      activeMs: after.time.activeMs - before.time.activeMs,
      waitMs: after.time.waitMs - before.time.waitMs,
      requests: after.counters.requests - before.counters.requests,
      retries: after.counters.retries - before.counters.retries,
    },
    unknowns,
  };
}
