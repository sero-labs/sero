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
import { type ArtifactSink, commandResultToCheck } from './checks';
import { isoNow, type Clock } from './clock';

export interface RunCriteriaDeps extends ArtifactSink {
  workspaceId: string;
  cwd: string;
  /** Per-command timeout (RunBudget.maxCommandRuntimeMs); host default when undefined. */
  commandTimeoutMs?: number;
  clock: Clock;
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
      // Generalized reviewer judge lands in P-B.
      return placeholder(deps, criterion, 'Judge evaluation is not available yet.');
    case 'threshold':
      // Measurement extraction + compare lands in P-C.
      return placeholder(deps, criterion, 'Measurement evaluation is not available yet.');
  }
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
