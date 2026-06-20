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
  LoopCheck,
} from '../shared/types';
import { safeArtifactName, writeArtifact } from './artifacts';
import { isoNow, type Clock } from './clock';
import type { ReviewerRunner } from './reviewers';

const SUMMARY_TAIL_BYTES = 800;

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
  return normalize(deps, check.type, id, command, result, startedAt, endedAt);
}

async function normalize(
  deps: RunChecksDeps,
  type: CheckType,
  id: string,
  command: string,
  result: AppRuntimeVerificationCommandResult,
  startedAt: string,
  endedAt: string,
): Promise<CheckResult> {
  const status: CheckStatus = result.success ? 'passed' : 'failed';
  const stdoutPath = await maybeArtifact(deps, id, 'stdout', result.stdout);
  const stderrPath = await maybeArtifact(deps, id, 'stderr', result.stderr);
  const summary = result.success
    ? `Passed in ${result.durationMs}ms.`
    : [
        deps.host.verification.summarizeFailure(result),
        tail(result.stderr || result.stdout, SUMMARY_TAIL_BYTES),
      ]
        .filter(Boolean)
        .join('\n')
        .trim();
  return {
    checkId: id,
    type,
    status,
    command,
    summary,
    stdoutPath,
    stderrPath,
    durationMs: result.durationMs,
    startedAt,
    endedAt,
  };
}

/** Persist output to an artifact only when it exceeds the inline budget. */
async function maybeArtifact(
  deps: RunChecksDeps,
  id: string,
  kind: 'stdout' | 'stderr' | 'review',
  content: string,
): Promise<string | undefined> {
  if (!content || content.length <= deps.maxInlineOutputBytes) return undefined;
  return writeArtifact(
    deps.stateFilePath,
    deps.attemptId,
    `check-${safeArtifactName(id)}-${kind}.txt`,
    content,
  );
}

function tail(text: string, max: number): string {
  if (text.length <= max) return text;
  return `…${text.slice(text.length - max)}`;
}
