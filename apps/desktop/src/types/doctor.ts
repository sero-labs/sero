// Environment Doctor shared renderer/preload types.

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

export interface DoctorEnvAudit {
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
  envAudit: DoctorEnvAudit;
  durationMs: number;
}

export type DoctorProgressEvent =
  | { kind: 'all-start'; runId: string }
  | { kind: 'check-start'; runId: string; id: string; category: DoctorCategory }
  | { kind: 'check-done'; runId: string; result: DoctorResult }
  | { kind: 'all-done'; runId: string; report: DoctorReport };

export interface DoctorRunArgs {
  category?: DoctorCategory;
  allProfiles?: boolean;
  /** Caller-supplied identifier so renderers can filter their own run's events. */
  runId?: string;
}

export interface DoctorRepairResponse {
  status: 'success' | 'failed' | 'skipped';
  message: string;
}
