import { randomUUID } from 'node:crypto';

import type { DesignLibraryPaths } from '../shared/paths';
import type { JobKind, JobRecord, JobTarget } from '../shared/records';
import { mutateVariant, readDesign } from './design-store';
import { listJobs, mutateItem, mutateJob, readItem, saveJob } from './store';

/**
 * The persisted job contract.
 *
 * Every unit of background work has a durable record, so the runtime can keep
 * working while the plugin UI is closed and pick up where it left off after a
 * restart. There is no generic scheduler — a job is owned by the thing that
 * created it, and its lifecycle is only these few transitions.
 */

export async function createJob(
  paths: DesignLibraryPaths,
  kind: JobKind,
  target: JobTarget,
): Promise<JobRecord> {
  const job: JobRecord = {
    id: randomUUID(),
    kind,
    status: 'queued',
    target,
    createdAt: Date.now(),
    attempts: 0,
  };
  await saveJob(paths, job);
  return job;
}

export async function markRunning(paths: DesignLibraryPaths, jobId: string): Promise<JobRecord | null> {
  return mutateJob(paths, jobId, (job) => ({
    ...job,
    status: 'running',
    startedAt: Date.now(),
    attempts: job.attempts + 1,
    error: undefined,
  }));
}

export async function markSucceeded(paths: DesignLibraryPaths, jobId: string): Promise<void> {
  await mutateJob(paths, jobId, (job) => ({
    ...job,
    status: 'succeeded',
    completedAt: Date.now(),
    error: undefined,
  }));
}

export async function markFailed(
  paths: DesignLibraryPaths,
  jobId: string,
  reason: string,
): Promise<void> {
  await mutateJob(paths, jobId, (job) => ({
    ...job,
    status: 'failed',
    completedAt: Date.now(),
    error: reason,
  }));
}

export async function markCancelled(paths: DesignLibraryPaths, jobId: string): Promise<void> {
  await mutateJob(paths, jobId, (job) => ({
    ...job,
    status: 'cancelled',
    completedAt: Date.now(),
    cancelRequested: true,
  }));
}

export async function requestCancel(paths: DesignLibraryPaths, jobId: string): Promise<void> {
  await mutateJob(paths, jobId, (job) => ({ ...job, cancelRequested: true }));
}

/** Job states that mean the run is over, whatever the target still says. */
const TERMINAL: readonly JobRecord['status'][] = ['succeeded', 'failed', 'cancelled'];

/**
 * Restart recovery. A job left `running` belonged to a process that died, and
 * a dead process cannot be trusted to have finished its work — so it goes back
 * to `queued` and runs again. Its target goes back to `pending` to match, which
 * is what stops the UI showing a spinner for a run nobody is doing.
 *
 * The reverse mismatch has to be repaired too. A job and its item or Design are
 * separate files and cannot be written atomically, so a crash between the two
 * leaves a finished job pointing at a target that still claims to be running.
 * Repairing only the running-job case left that target spinning for good:
 * nothing else ever revisits it.
 */
export async function reconcileJobs(paths: DesignLibraryPaths): Promise<JobRecord[]> {
  const jobs = await listJobs(paths);
  const interrupted = jobs.filter((job) => job.status === 'running');

  for (const job of interrupted) {
    await saveJob(paths, { ...job, status: 'queued', startedAt: undefined, cancelRequested: false });
    await rewindTarget(paths, job);
  }

  // A finished job whose target never heard about it. The work is run again
  // rather than the target declared ready: the crash happened before the result
  // was written, so there is nothing to show. A replacement job is created and
  // returned, because a target left `pending` with no job owning it is exactly
  // the stuck spinner this is here to prevent.
  const orphaned: JobRecord[] = [];
  for (const job of jobs.filter((entry) => TERMINAL.includes(entry.status))) {
    const replacement = await replaceOrphan(paths, job);
    if (replacement) orphaned.push(replacement);
  }

  return [...jobs.filter((job) => job.status === 'queued'), ...interrupted, ...orphaned];
}

/** Put the work this job owns back into a state a fresh run can pick up. */
async function rewindTarget(paths: DesignLibraryPaths, job: JobRecord): Promise<void> {
  if (job.target.kind === 'item') {
    await mutateItem(paths, job.target.itemId, (item) =>
      item.analysis.status === 'running'
        ? { ...item, analysis: { ...item.analysis, status: 'pending', jobId: job.id } }
        : item,
    );
    return;
  }
  const { designId, variantId } = job.target;
  await mutateVariant(paths, designId, variantId, (variant) =>
    variant.status === 'running' ? { ...variant, status: 'pending', jobId: job.id } : variant,
  );
}

/**
 * A replacement job for a target still claiming a terminal job is running.
 * Returns null when the target has already moved on, which is the normal case.
 */
async function replaceOrphan(
  paths: DesignLibraryPaths,
  job: JobRecord,
): Promise<JobRecord | null> {
  if (job.target.kind === 'item') {
    const item = await readItem(paths, job.target.itemId);
    if (item?.analysis.jobId !== job.id || item.analysis.status !== 'running') return null;

    const replacement = await createJob(paths, 'analysis', job.target);
    await mutateItem(paths, job.target.itemId, (current) => ({
      ...current,
      analysis: { ...current.analysis, status: 'pending', jobId: replacement.id, error: undefined },
    }));
    return replacement;
  }

  const { designId, variantId } = job.target;
  const design = await readDesign(paths, designId);
  const variant = design?.variants.find((entry) => entry.id === variantId);
  if (!variant || variant.jobId !== job.id || variant.status !== 'running') return null;

  const replacement = await createJob(paths, 'generate', job.target);
  await mutateVariant(paths, designId, variantId, (current) => ({
    ...current,
    status: 'pending',
    jobId: replacement.id,
    error: undefined,
  }));
  return replacement;
}
