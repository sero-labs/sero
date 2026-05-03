/**
 * Safe-mode doctor entry.
 *
 * Reached when the user invokes `electron --doctor`. Critical: this
 * code path must not call `loadSeroEnv()`, must not register IPC
 * handlers, and must tolerate every form of broken on-disk state.
 */

import { runDoctor } from '../engine/runner';
import type { DoctorCategory, DoctorReport } from '../engine/types';
import { buildSnapshots } from '../profile-state/snapshot';

export interface SafeModeOptions {
  mode?: 'quick' | 'full';
  category?: DoctorCategory;
  profileFilter?: string;
  allProfiles?: boolean;
  seroVersion: string;
  runId?: string;
}

export async function runSafeModeDoctor(
  options: SafeModeOptions,
): Promise<DoctorReport> {
  const { active, all } = buildSnapshots({
    profileFilter: options.profileFilter,
    allProfiles: options.allProfiles,
  });
  return runDoctor({
    mode: options.mode ?? 'quick',
    category: options.category,
    contextMode: 'safe',
    profile: active,
    allProfiles: all,
    seroVersion: options.seroVersion,
    runId: options.runId,
  });
}
