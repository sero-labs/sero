/**
 * In-app doctor entry: invoked from IPC handlers when Sero is fully
 * booted. Snapshots are loaded fresh on each run.
 */

import { runDoctor, type RunOptions } from '../engine/runner';
import type { DoctorCategory, DoctorReport, DoctorProgressEvent } from '../engine/types';
import { buildSnapshots } from '../profile-state/snapshot';

export interface RunInAppOptions {
  mode?: 'quick' | 'full';
  category?: DoctorCategory;
  allProfiles?: boolean;
  signal?: AbortSignal;
  onProgress?: (event: DoctorProgressEvent) => void;
  seroVersion: string;
  /** Caller-supplied run id. The runner generates one when omitted. */
  runId?: string;
}

export async function runInAppDoctor(
  options: RunInAppOptions,
): Promise<DoctorReport> {
  const { active, all } = buildSnapshots({
    allProfiles: options.allProfiles,
  });
  const runOptions: RunOptions = {
    mode: options.mode ?? 'full',
    category: options.category,
    contextMode: 'in-app',
    profile: active,
    allProfiles: all,
    seroVersion: options.seroVersion,
    onProgress: options.onProgress,
    signal: options.signal,
    runId: options.runId,
  };
  return runDoctor(runOptions);
}
