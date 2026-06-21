// Check normalization (D-12). Every check backend — verification, command, and
// review — collapses to one `CheckResult` shape so stop rules and learning never
// branch on the backend. `verification` and `command` checks both run through
// `host.verification.runCommands` (which gives us `summarizeFailure`, incl.
// native-dependency detection); `review` checks run a read-only reviewer subagent
// via the injected `reviewer` runner (reviewers.ts), and are reported `skipped`
// only when no reviewer runner is available.
//
// Output beyond `maxInlineOutputBytes` is written in full to an artifact and
// referenced by path; the inline `summary` always carries a short failure tail.

import type {
  AppRuntimeHost,
  AppRuntimeVerificationCommandResult,
} from '@sero-ai/common';

import type {
  CheckResult,
  CheckStatus,
  CheckType,
  DecisionKind,
  LoopCheck,
} from '../shared/types';
import { safeArtifactName, writeArtifact } from './artifacts';
import { isoNow, type Clock } from './clock';
import type { ReviewerRunner } from './reviewers';

const SUMMARY_TAIL_BYTES = 800;

/**
 * Where oversized check output is written (D-14). A {@link RunChecksDeps} is
 * structurally an `ArtifactSink`, so both the legacy check path and the
 * verification-plan criteria path (criteria.ts) normalize through the same code.
 */
export interface ArtifactSink {
  host: AppRuntimeHost;
  stateFilePath: string;
  attemptId: string;
  maxInlineOutputBytes: number;
}

export interface RunChecksDeps {
  host: AppRuntimeHost;
  workspaceId: string;
  cwd: string;
  stateFilePath: string;
  attemptId: string;
  /** Per-command timeout (RunBudget.maxCommandRuntimeMs); host default when undefined. */
  commandTimeoutMs?: number;
  maxInlineOutputBytes: number;
  clock: Clock;
  /** Runs `review` checks via a reviewer subagent; absent → review checks skip. */
  reviewer?: ReviewerRunner;
}

/** Run every check in order, normalizing each into a `CheckResult`. */
export async function runChecks(
  deps: RunChecksDeps,
  checks: LoopCheck[],
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (let index = 0; index < checks.length; index++) {
    results.push(await runOne(deps, checks[index]!, index));
  }
  return results;
}

/** Stable id for a check, positional so results pair back to `checks[i]`. */
export function checkId(check: LoopCheck, index: number): string {
  if (check.type === 'review') return `review:${index}:${check.reviewer}`;
  return `${check.type}:${index}`;
}

async function runOne(
  deps: RunChecksDeps,
  check: LoopCheck,
  index: number,
): Promise<CheckResult> {
  const startedAt = isoNow(deps.clock);
  const id = checkId(check, index);

  if (check.type === 'review') {
    if (!deps.reviewer) {
      return {
        checkId: id,
        type: 'review',
        status: 'skipped',
        summary: `Reviewer "${check.reviewer}" needs a background worker to run.`,
        startedAt,
        endedAt: isoNow(deps.clock),
      };
    }
    const verdict = await deps.reviewer(check.reviewer);
    const endedAt = isoNow(deps.clock);
    const stdoutPath = await maybeArtifact(deps, id, 'review', verdict.response);
    return {
      checkId: id,
      type: 'review',
      status: verdict.passed ? 'passed' : 'failed',
      summary: verdict.summary,
      stdoutPath,
      startedAt,
      endedAt,
    };
  }

  const command = check.command;
  const verification = await deps.host.verification.runCommands(
    deps.workspaceId,
    deps.cwd,
    [command],
    deps.commandTimeoutMs,
  );
  const result = verification.results[0];
  const endedAt = isoNow(deps.clock);
  if (!result) {
    return {
      checkId: id,
      type: check.type,
      status: 'failed',
      command,
      summary: 'Check produced no result.',
      startedAt,
      endedAt,
    };
  }
  return commandResultToCheck(deps, {
    checkId: id,
    type: check.type,
    command,
    result,
    startedAt,
    endedAt,
  });
}

export interface CommandResultInput {
  checkId: string;
  type: CheckType;
  /** For criterion results: how this criterion was decided (spec 05). */
  decisionKind?: DecisionKind;
  command: string;
  result: AppRuntimeVerificationCommandResult;
  startedAt: string;
  endedAt: string;
}

/**
 * Normalize a host verification command result into a `CheckResult` (D-12) —
 * the single place a command outcome becomes a CheckResult, shared by legacy
 * checks and verification-plan criteria.
 */
export async function commandResultToCheck(
  sink: ArtifactSink,
  input: CommandResultInput,
): Promise<CheckResult> {
  const { result } = input;
  const status: CheckStatus = result.success ? 'passed' : 'failed';
  const stdoutPath = await maybeArtifact(sink, input.checkId, 'stdout', result.stdout);
  const stderrPath = await maybeArtifact(sink, input.checkId, 'stderr', result.stderr);
  const summary = result.success
    ? `Passed in ${result.durationMs}ms.`
    : [
        sink.host.verification.summarizeFailure(result),
        tail(result.stderr || result.stdout, SUMMARY_TAIL_BYTES),
      ]
        .filter(Boolean)
        .join('\n')
        .trim();
  return {
    checkId: input.checkId,
    type: input.type,
    decisionKind: input.decisionKind,
    status,
    command: input.command,
    summary,
    stdoutPath,
    stderrPath,
    durationMs: result.durationMs,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
  };
}

/** Persist output to an artifact only when it exceeds the inline budget. */
export async function maybeArtifact(
  sink: ArtifactSink,
  id: string,
  kind: 'stdout' | 'stderr' | 'review' | 'judge' | 'evidence',
  content: string,
  /** Retain even when small — e.g. a judge reply with no parseable verdict (diagnosis). */
  always = false,
): Promise<string | undefined> {
  if (!content || (!always && content.length <= sink.maxInlineOutputBytes)) return undefined;
  return writeArtifact(
    sink.stateFilePath,
    sink.attemptId,
    `check-${safeArtifactName(id)}-${kind}.txt`,
    content,
  );
}

export function tail(text: string, max: number): string {
  if (text.length <= max) return text;
  return `…${text.slice(text.length - max)}`;
}
