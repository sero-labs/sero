/**
 * Durable jobs.
 *
 * One persisted job per unit of work — a Librarian analysis, a variant, an
 * asset retry. Siblings are independent: a failure or cancellation never rolls
 * one back. Cancellation is an `AbortSignal`; a Sero restart reconciles jobs
 * that were still running into a resumable state.
 */

import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { jobPath, type StoragePaths } from '../shared/paths';
import { mutateRecord, readJsonFile } from '../shared/state-io';
import { newId } from '../shared/ids';
import type { JobRecord } from '../shared/records';
import type { JobKind, JobStatus } from '../shared/types';

export interface JobInput {
  kind: JobKind;
  ownerId: string;
  scopeId?: string;
  label: string;
  payload: Record<string, unknown>;
}

export class JobStore {
  private readonly controllers = new Map<string, AbortController>();

  constructor(
    private readonly paths: StoragePaths,
    private readonly now: () => number,
  ) {}

  async create(input: JobInput): Promise<JobRecord> {
    const id = newId('job', this.now());
    return mutateRecord<JobRecord>(jobPath(this.paths, id), () => ({
      revision: 0,
      id,
      kind: input.kind,
      ownerId: input.ownerId,
      ...(input.scopeId ? { scopeId: input.scopeId } : {}),
      status: 'queued',
      attempt: 1,
      label: input.label,
      payload: input.payload,
      createdAt: this.now(),
      updatedAt: this.now(),
    }));
  }

  async update(
    jobId: string,
    status: JobStatus,
    errorMessage?: string,
  ): Promise<void> {
    await mutateRecord<JobRecord>(jobPath(this.paths, jobId), (current) => {
      if (!current) throw new Error(`Unknown job ${jobId}.`);
      const next = { ...current, status, updatedAt: this.now() };
      if (errorMessage === undefined) delete next.errorMessage;
      else next.errorMessage = errorMessage;
      if (status === 'running') next.attempt = current.attempt;
      return next;
    });
  }

  signal(jobId: string): AbortSignal {
    const controller = new AbortController();
    this.controllers.set(jobId, controller);
    return controller.signal;
  }

  /** Cancel a running job. Completed siblings are untouched. */
  cancel(jobId: string): boolean {
    const controller = this.controllers.get(jobId);
    if (!controller) return false;
    controller.abort();
    this.controllers.delete(jobId);
    return true;
  }

  release(jobId: string): void {
    this.controllers.delete(jobId);
  }

  cancelAll(): void {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
  }

  async list(): Promise<JobRecord[]> {
    const entries = await readdir(this.paths.jobs).catch(() => []);
    const jobs: JobRecord[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const job = await readJsonFile<JobRecord>(path.join(this.paths.jobs, entry));
      if (job) jobs.push(job);
    }
    return jobs.sort((left, right) => left.createdAt - right.createdAt);
  }

  /**
   * Restart reconciliation. Anything the previous process left `running` or
   * `queued` becomes `interrupted`, which is the resumable state the
   * coordinator picks back up.
   */
  async reconcile(): Promise<JobRecord[]> {
    const jobs = await this.list();
    const resumable: JobRecord[] = [];
    for (const job of jobs) {
      if (job.status !== 'running' && job.status !== 'queued') continue;
      const updated = await mutateRecord<JobRecord>(jobPath(this.paths, job.id), (current) => ({
        ...(current ?? job),
        status: 'interrupted',
        updatedAt: this.now(),
      }));
      resumable.push(updated);
    }
    return resumable;
  }

  /** Remove finished job files so the directory stays bounded. */
  async prune(keep = 200): Promise<void> {
    const jobs = await this.list();
    const finished = jobs.filter(
      (job) => job.status === 'succeeded' || job.status === 'cancelled',
    );
    for (const job of finished.slice(0, Math.max(0, finished.length - keep))) {
      await rm(jobPath(this.paths, job.id), { force: true });
    }
  }
}
