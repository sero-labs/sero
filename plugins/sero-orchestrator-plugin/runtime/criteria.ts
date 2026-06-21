// Verification-plan criterion evaluation (spec 05 §6). The planner authors what
// "done" means; this module evaluates each criterion at the canonical attempt cwd
// and collapses it to one CheckResult (D-12) — the same shape stop rules and
// learning already consume, so nothing downstream branches on the backend.
//
// Each criterion: gather its evidence (read-only / measurement), then apply its
// decision. `exit-zero` is mechanical and lives here (P-A). `judge` (P-B) and
// `threshold` (P-C) slot into the same switch as later phases land; until then
// they are reported `skipped` so a required one never silently "passes".

import type {
  CheckResult,
  CheckStatus,
  DecisionKind,
  EvidenceStep,
  SuccessCriterion,
} from '../shared/types';
import { type ArtifactSink, commandResultToCheck, maybeArtifact } from './checks';
import { isoNow, type Clock } from './clock';
import { gatherEvidence } from './evidence';
import type { CriterionJudge } from './judge';
import { compareThreshold, extractNumbers } from './measurement';

export interface RunCriteriaDeps extends ArtifactSink {
  workspaceId: string;
  cwd: string;
  /** Per-command timeout (RunBudget.maxCommandRuntimeMs); host default when undefined. */
  commandTimeoutMs?: number;
  /** The attempt's pre-attempt baseline; `diff` evidence is taken against it. */
  baseRef?: string;
  clock: Clock;
  /** Judges `judge` criteria (spec 05 §6.3); absent → judge criteria skip. */
  judge?: CriterionJudge;
}

/** Evaluate every criterion in order, each normalizing into one CheckResult. */
export async function runCriteria(
  deps: RunCriteriaDeps,
  criteria: SuccessCriterion[],
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const criterion of criteria) {
    results.push(await evaluateCriterion(deps, criterion));
  }
  return results;
}

async function evaluateCriterion(
  deps: RunCriteriaDeps,
  criterion: SuccessCriterion,
): Promise<CheckResult> {
  switch (criterion.decision.kind) {
    case 'exit-zero':
      return evaluateExitZero(deps, criterion);
    case 'judge':
      return evaluateJudge(deps, criterion);
    case 'threshold':
      return evaluateThreshold(deps, criterion);
  }
}

/** Judgement: a read-only judge reads the gathered evidence and rules (spec 05 §6.3). */
async function evaluateJudge(
  deps: RunCriteriaDeps,
  criterion: SuccessCriterion,
  note?: string,
): Promise<CheckResult> {
  const startedAt = isoNow(deps.clock);
  if (!deps.judge) {
    return result(criterion, 'skipped', note ?? 'Judge evaluation needs a background worker.', startedAt, isoNow(deps.clock));
  }
  const evidence = await gatherEvidence(deps, criterion.evidence);
  const verdict = await deps.judge(criterion, evidence);
  const endedAt = isoNow(deps.clock);
  // Always retain the reply when no verdict parsed, so "no verdict" is diagnosable.
  const stdoutPath = await maybeArtifact(deps, criterion.id, 'judge', verdict.response, !verdict.parsed);
  return {
    checkId: criterion.id,
    type: 'criterion',
    decisionKind: criterion.decision.kind,
    status: verdict.passed ? 'passed' : 'failed',
    summary: note ? `${note} ${verdict.summary}` : verdict.summary,
    stdoutPath,
    startedAt,
    endedAt,
  };
}

/**
 * Measurement: run the measurement command, extract the number(s), compare
 * against the LLM-authored threshold, aggregate (spec 05 §6.2). When extraction
 * is ambiguous (no clean number) the criterion falls back to the judge so a fuzzy
 * measurement never passes/fails on a guess.
 */
async function evaluateThreshold(
  deps: RunCriteriaDeps,
  criterion: SuccessCriterion,
): Promise<CheckResult> {
  const decision = criterion.decision;
  if (decision.kind !== 'threshold') {
    return placeholder(deps, criterion, 'Not a threshold criterion.');
  }
  const startedAt = isoNow(deps.clock);
  const commands = runCommands(criterion.evidence);
  if (commands.length === 0) {
    return result(criterion, 'failed', 'No measurement command for this threshold criterion.', startedAt, isoNow(deps.clock));
  }
  const verification = await deps.host.verification.runCommands(
    deps.workspaceId,
    deps.cwd,
    commands,
    deps.commandTimeoutMs,
  );
  const output = verification.results.map((r) => r.stdout).filter(Boolean).join('\n');
  const numbers = extractNumbers(output, decision.metric);
  if (numbers.length === 0) {
    // Ambiguous extraction → judge-fallback (spec 05 §4.2).
    return evaluateJudge(deps, criterion, 'Measurement output was not a clean number, so it was judged:');
  }
  const { passed, summary } = compareThreshold(numbers, decision);
  return {
    checkId: criterion.id,
    type: 'criterion',
    decisionKind: 'threshold',
    status: passed ? 'passed' : 'failed',
    summary,
    startedAt,
    endedAt: isoNow(deps.clock),
  };
}

/** Mechanical: pass iff every `run` evidence command exits 0 (spec 05 §4.2). */
async function evaluateExitZero(
  deps: RunCriteriaDeps,
  criterion: SuccessCriterion,
): Promise<CheckResult> {
  const startedAt = isoNow(deps.clock);
  const commands = runCommands(criterion.evidence);
  if (commands.length === 0) {
    return result(criterion, 'failed', 'No command to run for this exit-zero criterion.', startedAt, isoNow(deps.clock));
  }
  const verification = await deps.host.verification.runCommands(
    deps.workspaceId,
    deps.cwd,
    commands,
    deps.commandTimeoutMs,
  );
  const endedAt = isoNow(deps.clock);
  // Representative result: the first failure (so its output explains the miss),
  // else the last success.
  const representative =
    verification.results.find((candidate) => !candidate.success) ??
    verification.results[verification.results.length - 1];
  if (!representative) {
    return result(criterion, 'failed', 'Check produced no result.', startedAt, endedAt);
  }
  return commandResultToCheck(deps, {
    checkId: criterion.id,
    type: 'criterion',
    decisionKind: 'exit-zero',
    command: representative.command,
    result: representative,
    startedAt,
    endedAt,
  });
}

/** The `run` evidence commands, in order. */
export function runCommands(evidence: EvidenceStep[]): string[] {
  return evidence
    .filter((step): step is Extract<EvidenceStep, { kind: 'run' }> => step.kind === 'run')
    .map((step) => step.command);
}

function placeholder(
  deps: RunCriteriaDeps,
  criterion: SuccessCriterion,
  summary: string,
): CheckResult {
  const at = isoNow(deps.clock);
  return result(criterion, 'skipped', summary, at, at);
}

function result(
  criterion: SuccessCriterion,
  status: CheckStatus,
  summary: string,
  startedAt: string,
  endedAt: string,
): CheckResult {
  return {
    checkId: criterion.id,
    type: 'criterion',
    decisionKind: criterion.decision.kind as DecisionKind,
    status,
    summary,
    startedAt,
    endedAt,
  };
}
