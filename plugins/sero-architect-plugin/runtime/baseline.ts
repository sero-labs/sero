/**
 * Efficiency baseline records (spec architect-run-observability).
 *
 * A record describes one run of one strategy on one task. Two records can be
 * compared only when they are distinct runs that held the same controlled
 * inputs: request, starting workspace, acceptance checks, model, effort,
 * authorized capabilities and budgets. The strategy is the one thing allowed to
 * differ, and each strategy is free to choose its own execution structure.
 *
 * Three rules are enforced rather than documented:
 *
 * - A record built from synthetic data is an instrumentation check and is never
 *   evidence about model efficiency. `isEfficiencyEvidence` refuses it.
 * - An outcome comes from the task's own acceptance checks. The absence of a
 *   dispatch failure accepts nothing. `outcomeFromChecks` is the only source.
 * - A record is never compared with itself, and mismatched inputs or missing
 *   provenance are named instead of being attributed to the strategy.
 *
 * Records saved before the controlled-input fields existed stay readable. They
 * keep their original classification and cannot support a strategy claim.
 */

import type { ConfigurationProvenance } from './trace-summary';

/** The two objectives the first baseline measured. Kept so its records load. */
export type BaselineObjective = 'implementation-and-independent-review' | 'collaborative-planning';

/** The five task classes a strategy comparison must cover. */
export type BaselineScenario =
  | 'small-fix'
  | 'debugging'
  | 'substantial-feature'
  | 'collaborative-research'
  | 'interruption';

export const BASELINE_SCENARIOS: readonly BaselineScenario[] = [
  'small-fix', 'debugging', 'substantial-feature', 'collaborative-research', 'interruption',
];

/** How the work was driven. Neither is forced to use the other's roster. */
export type BaselineStrategy = 'architect' | 'persistent-single-agent';

/** Where the numbers came from. Only `live` can support a claim about efficiency. */
export type BaselineEvidence = 'live' | 'synthetic';

export type BaselineOutcome = 'accepted' | 'rejected' | 'incomplete';

/** Which run this is. Two records with one `runId` are the same observation. */
export interface BaselineRunIdentity {
  runId: string;
  strategy: BaselineStrategy;
  /** The source revision of the candidate build that ran. */
  revision: string;
  /** Which repeat of this strategy on this scenario, from 1. */
  replicate: number;
}

/** Everything a fair comparison holds constant between two strategies. */
export interface BaselineControlledInputs {
  /** The user's request, word for word. */
  request: string;
  /** Fingerprint of the starting workspace content. */
  workspaceFingerprint: string;
  /** Revision of the independent acceptance checks. */
  acceptanceRevision: string;
  /** The model the selected tier resolved to when the run started. */
  model: string;
  thinking: string;
  /** Tools and skills the candidate was authorized to use, sorted. */
  capabilities: string[];
  budgetUsd: number;
  budgetMinutes: number;
  /** True when the task itself requires an independent reviewer. */
  requiresIndependentReview: boolean;
}

/** One independent check of the delivered result. `null` means it did not run. */
export interface BaselineAcceptanceCheck {
  id: string;
  passed: boolean | null;
  detail?: string;
}

/** A person or the harness stepping in. A rescued run is not unassisted. */
export interface BaselineIntervention {
  kind: 'coaching' | 'state-repair' | 'file-transfer' | 'other';
  note: string;
  at: string;
}

export interface BaselineRecovery {
  /** What interrupted the run: a restart, a watchdog, a stop. */
  cause: string;
  result: 'recovered' | 'held' | 'failed';
}

export interface BaselineRecord {
  /** The objective under test, named exactly. */
  candidate: string;
  objective: BaselineObjective | BaselineScenario;
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
  outcome: BaselineOutcome;
  /** The bounded spend ceiling approved for this evaluation, in USD. */
  budgetUsd: number;
  evidence: BaselineEvidence;
  recordedAt: string;
  /** Absent on records saved before strategy comparisons existed. */
  run?: BaselineRunIdentity;
  inputs?: BaselineControlledInputs;
  /** The checks the outcome was derived from. */
  checks?: BaselineAcceptanceCheck[];
  interventions?: BaselineIntervention[];
  /** Investigations or edits the run did more than once. */
  repeatedWork?: number;
  /** Turns spent repairing a malformed result rather than doing the task. */
  protocolFailures?: number;
  recoveries?: BaselineRecovery[];
  /** Total tokens of each owner turn, in order. */
  ownerTokensPerTurn?: number[];
}

/**
 * The outcome of a run, from its independent checks alone.
 *
 * A run that did not finish is incomplete whatever its checks say. A finished
 * run with no checks, or with a check that did not run, is also incomplete:
 * nothing observed the result. One failed check rejects it.
 */
export function outcomeFromChecks(checks: readonly BaselineAcceptanceCheck[], finished: boolean): BaselineOutcome {
  if (!finished || checks.length === 0) return 'incomplete';
  if (checks.some((check) => check.passed === false)) return 'rejected';
  if (checks.some((check) => check.passed === null)) return 'incomplete';
  return 'accepted';
}

/** Operations whose model or effort was never recorded. */
export function provenanceGaps(record: BaselineRecord): string[] {
  return record.models
    .filter((entry) => !entry.model || !entry.thinking)
    .map((entry) => entry.operationId);
}

/** The controlled inputs two records disagree on, by field name. */
export function controlledInputMismatches(a: BaselineControlledInputs, b: BaselineControlledInputs): string[] {
  const fields: (keyof BaselineControlledInputs)[] = [
    'request', 'workspaceFingerprint', 'acceptanceRevision', 'model', 'thinking',
    'capabilities', 'budgetUsd', 'budgetMinutes', 'requiresIndependentReview',
  ];
  return fields.filter((field) => JSON.stringify(a[field]) !== JSON.stringify(b[field]));
}

/**
 * True only for a live measurement that reached a checked outcome.
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
  if ((record.interventions?.length ?? 0) > 0) return 'The run needed an intervention, so it does not show unassisted completion.';
  return null;
}

/**
 * Compares two distinct runs of the same task. It reports what changed and what
 * stayed unknown; it never turns a missing measurement into an improvement.
 */
export interface BaselineComparison {
  objective: BaselineObjective | BaselineScenario;
  /** True when the two records are distinct runs that held the same inputs. */
  comparable: boolean;
  /** Controlled inputs the two runs disagree on. */
  mismatches: string[];
  outcomes: { before: BaselineOutcome; after: BaselineOutcome };
  deltas: {
    attributableUsd: number;
    elapsedMs: number;
    activeMs: number;
    waitMs: number;
    requests: number;
    retries: number;
    interventions: number;
    repeatedWork: number;
    protocolFailures: number;
  };
  /** What the comparison cannot support. */
  unknowns: string[];
}

export function compareBaselines(before: BaselineRecord, after: BaselineRecord): BaselineComparison {
  const sameRun = before === after || (before.run !== undefined && before.run.runId === after.run?.runId);
  const sameTask = before.objective === after.objective
    && before.acceptanceCriteria.join('|') === after.acceptanceCriteria.join('|');
  const mismatches = before.inputs && after.inputs ? controlledInputMismatches(before.inputs, after.inputs) : [];

  const unknowns: string[] = [];
  if (sameRun) unknowns.push('Both sides are the same run. A record compared with itself shows nothing.');
  if (!sameTask) unknowns.push('The two records do not share an objective and acceptance criteria.');
  if (mismatches.length > 0) unknowns.push(`The controlled inputs differ: ${mismatches.join(', ')}.`);
  if (!before.inputs || !after.inputs || !before.run || !after.run) {
    unknowns.push('At least one record has no run identity or controlled inputs, so a strategy effect cannot be attributed.');
  }
  if (before.evidence !== 'live' || after.evidence !== 'live') unknowns.push('At least one record is synthetic.');
  if (before.outcome === 'incomplete' || after.outcome === 'incomplete') unknowns.push('At least one run did not finish with a checked outcome.');
  if (before.cost.incomplete || after.cost.incomplete) unknowns.push('At least one record has incomplete cost coverage.');
  if (before.models.length === 0 || after.models.length === 0) unknowns.push('At least one record names no model, so a model change cannot be attributed.');
  if (provenanceGaps(before).length > 0 || provenanceGaps(after).length > 0) {
    unknowns.push('At least one operation has no recorded model or effort, so a controlled strategy effect cannot be claimed.');
  }
  if ((before.interventions?.length ?? 0) > 0 || (after.interventions?.length ?? 0) > 0) {
    unknowns.push('At least one run needed an intervention, so it does not show unassisted completion.');
  }

  return {
    objective: before.objective,
    comparable: !sameRun && sameTask && mismatches.length === 0,
    mismatches,
    outcomes: { before: before.outcome, after: after.outcome },
    deltas: {
      attributableUsd: after.cost.attributableUsd - before.cost.attributableUsd,
      elapsedMs: after.time.elapsedMs - before.time.elapsedMs,
      activeMs: after.time.activeMs - before.time.activeMs,
      waitMs: after.time.waitMs - before.time.waitMs,
      requests: after.counters.requests - before.counters.requests,
      retries: after.counters.retries - before.counters.retries,
      interventions: (after.interventions?.length ?? 0) - (before.interventions?.length ?? 0),
      repeatedWork: (after.repeatedWork ?? 0) - (before.repeatedWork ?? 0),
      protocolFailures: (after.protocolFailures ?? 0) - (before.protocolFailures ?? 0),
    },
    unknowns,
  };
}
