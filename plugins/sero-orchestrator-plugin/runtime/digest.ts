/**
 * Durable run digests (specs/06-reflection.md). At the end of every run a compact
 * RunDigest is appended to the loop's own `digests.json` — colocated with the
 * loop, kept OUTSIDE loop.json (so the hot file stays lean) and OUTSIDE run
 * pruning (so reflection keeps long-term memory). Far smaller than a full run, so
 * many more are retained.
 *
 * Reads/writes go through host.writeArtifact / host.readArtifact by the relative
 * path; the host resolves it under the state dir.
 */

import type { DigestLog, Loop, LoopRun, RunDigest, RunDigestStep, StepAttempt, StepStatus } from '../shared/types';
import type { OrchestratorHost } from './host';

export function digestsPath(loopId: string): string {
  return `loops/${loopId}/digests.json`;
}

const FAILED_STATUSES: ReadonlySet<StepStatus> = new Set(['failed', 'blocked', 'needs-revision']);

function stepStatusFromAttempt(attempt: StepAttempt): StepStatus {
  if (attempt.outcome) return attempt.outcome.status;
  if (attempt.status === 'completed') return 'succeeded';
  if (attempt.status === 'running') return 'running';
  return 'failed';
}

/** Compacts one finished run (plus the loop's plan, for step titles) into a digest. */
export function buildRunDigest(loop: Loop, run: LoopRun): RunDigest {
  const titleOf = (id: string) => loop.plan.steps.find((s) => s.id === id)?.title ?? id;
  const byStep = new Map<string, StepAttempt[]>();
  for (const attempt of run.stepAttempts) {
    const list = byStep.get(attempt.stepId) ?? [];
    list.push(attempt);
    byStep.set(attempt.stepId, list);
  }

  const steps: RunDigestStep[] = [];
  for (const [stepId, attempts] of byStep) {
    const last = attempts[attempts.length - 1];
    const status = stepStatusFromAttempt(last);
    const durationMs = attempts.reduce((sum, a) => sum + (a.usage?.durationMs ?? 0), 0) || undefined;
    steps.push({
      id: stepId,
      title: titleOf(stepId),
      status,
      attempts: attempts.length,
      model: last.model,
      durationMs,
      failureSummary: FAILED_STATUSES.has(status) ? last.outcome?.summary ?? last.error : undefined,
    });
  }

  return {
    runNumber: run.runNumber,
    status: run.status,
    statusReason: run.statusReason,
    retryAt: run.retryAt,
    completion: run.completionSignal?.status,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    steps,
    recoveries: run.recoveryDecisions.map((d) => ({ stepId: d.stepId, decision: d.decision, reason: d.reason })),
    usage: run.usage,
  };
}

/** Reads the durable digests for a loop (empty when none/unreadable). */
export async function readDigests(host: OrchestratorHost, loopId: string): Promise<RunDigest[]> {
  const raw = await host.readArtifact(digestsPath(loopId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as DigestLog;
    return Array.isArray(parsed?.digests) ? parsed.digests : [];
  } catch {
    return [];
  }
}

/** Appends one digest (replacing any with the same run number) and trims to `retain`. */
export async function appendDigest(host: OrchestratorHost, loopId: string, digest: RunDigest, retain: number): Promise<void> {
  const existing = await readDigests(host, loopId);
  const merged = [...existing.filter((d) => d.runNumber !== digest.runNumber), digest].sort((a, b) => a.runNumber - b.runNumber);
  const trimmed = retain > 0 && merged.length > retain ? merged.slice(merged.length - retain) : merged;
  const log: DigestLog = { version: 1, digests: trimmed };
  await host.writeArtifact(digestsPath(loopId), JSON.stringify(log, null, 2));
}

/**
 * The full run history reflection reads: the durable digests, plus any in-memory
 * runs not in the digest file (covers runs that predate this feature and a
 * freshest run not yet flushed). Sorted by run number.
 */
export async function gatherHistory(host: OrchestratorHost, loop: Loop): Promise<RunDigest[]> {
  const durable = await readDigests(host, loop.id);
  const seen = new Set(durable.map((d) => d.runNumber));
  const fromRuns = (loop.runs ?? [])
    .filter((run) => !seen.has(run.runNumber))
    .map((run) => buildRunDigest(loop, run));
  return [...durable, ...fromRuns].sort((a, b) => a.runNumber - b.runNumber);
}
