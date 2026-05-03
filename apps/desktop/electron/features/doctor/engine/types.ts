/**
 * Public types for the Environment Doctor engine.
 *
 * The engine is renderer-safe: nothing in this module references Electron,
 * native modules, or feature-specific code. Types are mirrored to the
 * renderer via re-export from `@/types/ipc`.
 */

import type { ProfileSnapshot } from '../profile-state/types';

export type DoctorStatus = 'pass' | 'warn' | 'fail';

export type DoctorCategory =
  | 'system'
  | 'runtime'
  | 'node'
  | 'profile'
  | 'workspace'
  | 'providers'
  | 'plugins'
  | 'environment';

export type DoctorMode = 'in-app' | 'safe' | 'quick';

export type DoctorFix =
  | { kind: 'manual'; instructions: string }
  | { kind: 'command'; command: string; args: string[]; description: string }
  | { kind: 'repair'; repairId: string; description: string; destructive: boolean };

export interface DoctorResult {
  id: string;
  category: DoctorCategory;
  status: DoctorStatus;
  message: string;
  fix?: DoctorFix;
  details?: Record<string, unknown>;
  durationMs: number;
}

export interface DoctorContext {
  mode: 'in-app' | 'safe';
  profile: ProfileSnapshot | null;
  allProfiles: ProfileSnapshot[];
  seroVersion: string;
  signal: AbortSignal;
  now(): Date;
}

export interface DoctorCheck {
  id: string;
  category: DoctorCategory;
  /** Skip in quick mode if true (default false). */
  slow?: boolean;
  /** Skip in safe mode if true (e.g. live workspace exec). */
  needsBootedApp?: boolean;
  run(ctx: DoctorContext): Promise<DoctorResult | DoctorResult[]>;
  repair?: DoctorRepair;
}

export interface RepairResult {
  status: 'success' | 'failed' | 'skipped';
  message: string;
  backedUpFiles?: string[];
}

export interface DoctorRepair {
  id: string;
  description: string;
  destructive: boolean;
  /** Not invoked in v1. Present for forward compatibility. */
  run(ctx: DoctorContext): Promise<RepairResult>;
}

export interface EnvAudit {
  present: string[];
  missing: string[];
  recommended: string[];
}

export interface DoctorReport {
  schemaVersion: 1;
  timestamp: string;
  mode: DoctorMode;
  system: { os: string; version: string; arch: string };
  seroVersion: string;
  /** Stable identifier for this run. Echoed by every progress event. */
  runId: string;
  profilesScanned: Array<{ id: string; pathHash: string }>;
  results: DoctorResult[];
  envAudit: EnvAudit;
  durationMs: number;
}

export type DoctorProgressEvent =
  | { kind: 'all-start'; runId: string }
  | { kind: 'check-start'; runId: string; id: string; category: DoctorCategory }
  | { kind: 'check-done'; runId: string; result: DoctorResult }
  | { kind: 'all-done'; runId: string; report: DoctorReport };
