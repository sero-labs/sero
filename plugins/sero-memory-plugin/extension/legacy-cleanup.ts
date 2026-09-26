/**
 * Removes the Scheduler job that older versions of this plugin created to
 * consolidate daily logs. Consolidation no longer exists, so the job would
 * start a model session every week that fails. Delete this file once
 * profiles have had a release or two to run it.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { withStateLock } from '@sero-ai/extension-runtime';

const LEGACY_JOB_NAME = 'memory-consolidation';
const LEGACY_JOB_CHANNEL = 'memory';

interface CronStateFile {
  jobs?: unknown;
  [key: string]: unknown;
}

function resolveCronStatePath(): string {
  const seroHome = process.env.SERO_HOME?.trim() || path.join(os.homedir(), '.sero-ui');
  return path.join(seroHome, 'apps', 'cron', 'state.json');
}

function isLegacyJob(job: unknown): boolean {
  if (!job || typeof job !== 'object') return false;
  const record = job as Record<string, unknown>;
  return record.name === LEGACY_JOB_NAME && record.channel === LEGACY_JOB_CHANNEL;
}

/** A missing or unreadable file is left alone: the cron plugin owns repair. */
async function readCronState(statePath: string): Promise<CronStateFile | null> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(statePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as CronStateFile : null;
  } catch {
    return null;
  }
}

function hasLegacyJob(state: CronStateFile | null): state is CronStateFile & { jobs: unknown[] } {
  return Array.isArray(state?.jobs) && state.jobs.some(isLegacyJob);
}

/** Returns true when the job was found and removed. */
export async function removeLegacyConsolidationJob(): Promise<boolean> {
  const statePath = resolveCronStatePath();
  // Check without the lock first: after the first run this is one file read.
  if (!hasLegacyJob(await readCronState(statePath))) return false;

  return withStateLock(statePath, async () => {
    const state = await readCronState(statePath);
    if (!hasLegacyJob(state)) return false;

    const next = { ...state, jobs: state.jobs.filter((job) => !isLegacyJob(job)) };
    const tmpPath = `${statePath}.tmp.${process.pid}.${randomUUID()}`;
    await fs.writeFile(tmpPath, JSON.stringify(next, null, 2), 'utf8');
    await fs.rename(tmpPath, statePath);
    return true;
  });
}
