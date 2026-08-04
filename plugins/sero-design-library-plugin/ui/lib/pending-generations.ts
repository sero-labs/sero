import type { JobSummary } from '../../shared/types';

/**
 * Which Library generations still need a tile (D3, D5).
 *
 * The grid is built from items, and a generation has no item until the provider
 * answers and the bytes take the import route — which can be a minute or more,
 * or never. Without a tile for it the surface says nothing happened, so the
 * obvious thing to do is press Generate again and pay twice.
 */

export interface PendingGeneration {
  jobId: string;
  /** The slot the request named, which is also what a replay keys on. */
  slotId: string;
  status: JobSummary['status'];
  error: string | undefined;
}

/** Jobs generating into the Library, in the order they were asked for. */
export function pendingGenerations(jobs: JobSummary[]): PendingGeneration[] {
  return jobs
    .filter(
      (job) =>
        job.target.kind === 'library' &&
        // A succeeded job's item is in the grid by now, so a tile for it would
        // be a duplicate of the thing it was waiting for.
        (job.status === 'queued' || job.status === 'running' || job.status === 'failed'),
    )
    .toSorted((a, b) => a.createdAt - b.createdAt)
    .map((job) => ({
      jobId: job.id,
      slotId: job.target.kind === 'library' ? job.target.slotId : job.id,
      status: job.status,
      error: job.error,
    }));
}
