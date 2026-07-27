import { randomUUID } from 'node:crypto';

import type { DesignLibraryPaths } from '../shared/paths';
import type { JobKind, JobRecord } from '../shared/records';
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
  itemId: string,
): Promise<JobRecord> {
  const job: JobRecord = {
    id: randomUUID(),
    kind,
    status: 'queued',
    itemId,
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

/** Job states that mean the run is over, whatever the item still says. */
const TERMINAL: readonly JobRecord['status'][] = ['succeeded', 'failed', 'cancelled'];

/**
 * Restart recovery. A job left `running` belonged to a process that died, and
 * a dead process cannot be trusted to have finished its work — so it goes back
 * to `queued` and runs again. Its item goes back to `pending` to match, which
 * is what stops the UI showing a spinner for a run nobody is doing.
 *
 * The reverse mismatch has to be repaired too. A job and its item are two files
 * and cannot be written atomically, so a crash between the two leaves a
 * finished job pointing at an item that still claims to be running. Repairing
 * only the running-job case left that item spinning for good: nothing else ever
 * revisits it.
 */
export async function reconcileJobs(paths: DesignLibraryPaths): Promise<JobRecord[]> {
  const jobs = await listJobs(paths);
  const interrupted = jobs.filter((job) => job.status === 'running');

  for (const job of interrupted) {
    await saveJob(paths, { ...job, status: 'queued', startedAt: undefined, cancelRequested: false });
    await mutateItem(paths, job.itemId, (item) =>
      item.analysis.status === 'running'
        ? { ...item, analysis: { ...item.analysis, status: 'pending', jobId: job.id } }
        : item,
    );
  }

  // A finished job whose item never heard about it. The analysis is run again
  // rather than the item declared ready: the crash happened before the profile
  // was written, so there is no result to show. A replacement job is created
  // and returned, because an item left `pending` with no job owning it is
  // exactly the stuck spinner this is here to prevent.
  const orphaned: JobRecord[] = [];
  for (const job of jobs.filter((entry) => TERMINAL.includes(entry.status))) {
    const item = await readItem(paths, job.itemId);
    if (item?.analysis.jobId !== job.id || item.analysis.status !== 'running') continue;

    const replacement = await createJob(paths, 'analysis', job.itemId);
    await mutateItem(paths, job.itemId, (current) => ({
      ...current,
      analysis: { ...current.analysis, status: 'pending', jobId: replacement.id, error: undefined },
    }));
    orphaned.push(replacement);
  }

  return [...jobs.filter((job) => job.status === 'queued'), ...interrupted, ...orphaned];
}
