import { randomUUID } from 'node:crypto';

import type { DesignLibraryPaths } from '../shared/paths';
import type { JobKind, JobRecord, JobTarget } from '../shared/records';
import { mutateDesign, mutateVariant, readDesign } from './design-store';
import { listJobs, mutateItem, mutateJob, saveJob } from './store';

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

  // Media never resumes. Every other kind of job is free to run again — a
  // generation or an analysis costs a model call the user already asked for —
  // but a media job that died mid-flight may well have been billed already, and
  // the user cannot know. Re-running it spends money they did not ask to spend
  // twice, which is the one behaviour D10 exists to prevent. So it comes back as
  // a placeholder with a retry and waits to be asked.
  const abandoned = jobs.filter((job) => job.kind === 'media' && job.status === 'running');
  for (const job of abandoned) {
    await abandonAsset(paths, job);
    await markFailed(
      paths,
      job.id,
      'Sero closed while this was generating. It was not run again, in case the provider had already charged for it.',
    );
  }

  const interrupted = jobs.filter((job) => job.kind !== 'media' && job.status === 'running');

  for (const job of interrupted) {
    // `cancelRequested` is kept rather than cleared. It is a durable record that
    // the user asked for this to stop, and a crash between the request and the
    // run noticing it must not resurrect the work — the resumed run sees the
    // flag and finishes cancelled, which is what was asked for.
    await saveJob(paths, { ...job, status: 'queued', startedAt: undefined });
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

/**
 * Turn an asset whose job died into a retryable placeholder.
 *
 * Written as a real failed attempt rather than left with none, because "no
 * attempts" is how the tray says *generating* — and an asset left saying that,
 * owned by a job that will never run again, is a spinner nobody stops.
 */
async function abandonAsset(paths: DesignLibraryPaths, job: JobRecord): Promise<void> {
  if (job.target.kind !== 'asset') return;
  const { designId, assetId } = job.target;
  await mutateDesign(paths, designId, (design) => {
    const asset = design.assets.find((entry) => entry.id === assetId);
    if (!asset || asset.jobId !== job.id || asset.attempts.length > 0) return null;
    const now = Date.now();
    return {
      ...design,
      assets: design.assets.map((entry) =>
        entry.id === assetId
          ? {
              ...entry,
              jobId: undefined,
              updatedAt: now,
              attempts: [
                {
                  id: `${job.id}-abandoned`,
                  outcome: 'failed' as const,
                  startedAt: job.startedAt ?? job.createdAt,
                  completedAt: now,
                  error: {
                    code: 'provider' as const,
                    message: 'Sero closed while this was generating, so it never finished.',
                    retryable: true,
                  },
                },
              ],
            }
          : entry,
      ),
    };
  });
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
  if (job.target.kind === 'variant') {
    const { designId, variantId } = job.target;
    await mutateVariant(paths, designId, variantId, (variant) =>
      variant.status === 'running' ? { ...variant, status: 'pending', jobId: job.id } : variant,
    );
    return;
  }
  // An asset and a Library slot carry no status of their own to rewind: an asset
  // with no attempts *is* the pending state, and the Library job holds
  // everything it needs. Re-queuing the job is the whole repair.
}

/**
 * Statuses a target can be left in when its own job has already finished — the
 * crash window between the job's terminal write and the target's.
 *
 * `pending` belongs here as much as `running` does. A cancel that never reached
 * its target leaves it exactly there, and repairing only `running` left an item
 * spinning with no job that would ever look at it again.
 */
const UNFINISHED: readonly string[] = ['pending', 'running'];

/**
 * Repair a target whose own job has finished without it hearing.
 *
 * A cancelled job finishes its target rather than replacing it: re-running would
 * resurrect work the user had already stopped. A succeeded or failed job means
 * the crash happened before the result was written, so there is nothing to show
 * and the work runs again — a replacement job is created and returned, because a
 * target left waiting with no job owning it is the stuck spinner this exists to
 * prevent. Returns null when the target has moved on, which is the normal case.
 */
async function replaceOrphan(
  paths: DesignLibraryPaths,
  job: JobRecord,
): Promise<JobRecord | null> {
  // Media is the exception to "run it again". Re-running spends money the user
  // did not ask to spend a second time, and they cannot have seen a result — so
  // an interrupted media job comes back as a placeholder with a retry button and
  // waits to be asked. Silently regenerating would be the one behaviour D10
  // exists to prevent.
  if (job.target.kind === 'asset') {
    await abandonAsset(paths, job);
    return null;
  }
  if (job.target.kind === 'library') return null;

  // A replacement has to exist before the target can point at it — a target
  // naming a job that does not exist has nothing to run it and nothing to repair
  // it. So one is created up front and retired below if the claim fails.
  const replacement =
    job.status === 'cancelled'
      ? null
      : await createJob(paths, job.kind, job.target);

  // Every condition is re-tested inside the mutation, under the record lock.
  // Reading them first and acting afterwards leaves a window in which a retry
  // installs a newer job, and this stale terminal one would then cancel or
  // replace work that had already moved on.
  const claim = (current: { jobId?: string; status: string }) =>
    current.jobId === job.id && UNFINISHED.includes(current.status);

  let claimed = false;

  if (job.target.kind === 'item') {
    await mutateItem(paths, job.target.itemId, (item) => {
      if (!claim({ ...(item.analysis.jobId === undefined ? {} : { jobId: item.analysis.jobId }), status: item.analysis.status })) {
        return null;
      }
      claimed = true;
      return replacement === null
        ? {
            ...item,
            analysis: { ...item.analysis, status: 'cancelled', completedAt: Date.now() },
          }
        : {
            ...item,
            analysis: {
              ...item.analysis,
              status: 'pending',
              jobId: replacement.id,
              error: undefined,
            },
          };
    });
  } else if (job.target.kind === 'variant') {
    const { designId, variantId } = job.target;
    await mutateVariant(paths, designId, variantId, (variant) => {
      if (!claim(variant)) return null;
      claimed = true;
      return replacement === null
        ? { ...variant, status: 'cancelled', completedAt: Date.now() }
        : { ...variant, status: 'pending', jobId: replacement.id, error: undefined };
    });
  }

  if (replacement === null) return null;
  if (!claimed) {
    // The target moved on between creating this and trying to claim it. The
    // unused job is retired rather than left queued, where it would start a run
    // that could only discover the same thing and cancel itself.
    await markCancelled(paths, replacement.id);
    return null;
  }
  return replacement;
}
