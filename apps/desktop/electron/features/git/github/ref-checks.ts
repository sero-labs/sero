/**
 * The CI checks of one branch or commit, read from GitHub: check runs (GitHub
 * Actions and apps) and commit statuses (older CI integrations) together.
 *
 * One read, no waiting. A caller that waits for checks to conclude decides
 * when to read again.
 */

import type { AppRuntimeCheckState, AppRuntimeRefChecks } from '@sero-ai/common';
import type { GhInvoker } from './invoker';

interface CheckRun { name?: string; status?: string; conclusion?: string | null; html_url?: string; head_sha?: string }
interface CommitStatus { context?: string; state?: string; target_url?: string | null }

/** A check that finished with anything but success, neutral or skipped counts as failed. */
function runState(run: CheckRun): AppRuntimeCheckState {
  if (run.status !== 'completed') return 'pending';
  return run.conclusion === 'success' || run.conclusion === 'neutral' || run.conclusion === 'skipped' ? 'passed' : 'failed';
}

function statusState(status: CommitStatus): AppRuntimeCheckState {
  if (status.state === 'success') return 'passed';
  if (status.state === 'failure' || status.state === 'error') return 'failed';
  return 'pending';
}

/** Pending while any check runs, failed when any failed, passed when all passed. */
export function combineChecks(checks: AppRuntimeRefChecks['checks']): AppRuntimeRefChecks['state'] {
  if (checks.length === 0) return 'none';
  if (checks.some((check) => check.state === 'pending')) return 'pending';
  return checks.some((check) => check.state === 'failed') ? 'failed' : 'passed';
}

export async function getRefChecks(gh: GhInvoker, ref: string): Promise<AppRuntimeRefChecks> {
  const encoded = encodeURIComponent(ref.trim());
  if (!encoded) return { state: 'unknown', checks: [], reason: 'No branch or commit was named.' };
  try {
    const [runsOut, statusOut] = await Promise.all([
      gh(['api', `repos/{owner}/{repo}/commits/${encoded}/check-runs?per_page=100`], 30_000),
      gh(['api', `repos/{owner}/{repo}/commits/${encoded}/status?per_page=100`], 30_000),
    ]);
    const runs = (JSON.parse(runsOut.stdout) as { check_runs?: CheckRun[] }).check_runs ?? [];
    const combined = JSON.parse(statusOut.stdout) as { sha?: string; statuses?: CommitStatus[] };
    const checks: AppRuntimeRefChecks['checks'] = [
      ...runs.map((run) => ({ name: run.name ?? 'check', state: runState(run), ...(run.html_url ? { url: run.html_url } : {}) })),
      ...(combined.statuses ?? []).map((status) => ({ name: status.context ?? 'status', state: statusState(status), ...(status.target_url ? { url: status.target_url } : {}) })),
    ];
    const sha = combined.sha ?? runs[0]?.head_sha;
    return { state: combineChecks(checks), ...(sha ? { sha } : {}), checks };
  } catch (error) {
    const reason = error instanceof Error ? error.message.trim().split('\n')[0] : String(error);
    return { state: 'unknown', checks: [], reason: reason || 'gh could not read the checks.' };
  }
}
