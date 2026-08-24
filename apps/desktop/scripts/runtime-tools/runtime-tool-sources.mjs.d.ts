export interface RuntimeUpdateCandidate {
  key: string;
  label: string;
  source: string;
  currentVersion: string;
  version: string;
  releasedAt: string;
  eligibleAt: string;
  eligible: boolean;
  firstSeenAt?: string;
  mode: 'routine' | 'breaking';
  details: Record<string, string>;
}

export function discoverRuntimeUpdates(
  pins: Record<string, unknown>,
  now?: Date,
): Promise<RuntimeUpdateCandidate[]>;

export function renderRuntimeUpdateReport(
  pins: Record<string, unknown>,
  candidates: RuntimeUpdateCandidate[],
  now?: Date,
): string;

export function applyObservationWindow(
  candidates: RuntimeUpdateCandidate[],
  observations: Record<string, Record<string, { identity: string; firstSeenAt: string }>>,
  now: Date,
  minimumReleaseAgeDays: number,
): Record<string, Record<string, { identity: string; firstSeenAt: string }>>;

export function isStableVersion(version: string): boolean;
export function compareVersions(left: string, right: string): number;
export function isRoutineUpdate(
  currentVersion: string,
  candidateVersion: string,
  routineUpdates: 'patch' | 'minor',
): boolean;
export function selectVersionUpdates<T extends {
  version: string;
  releasedAt?: string;
  deprecated?: boolean;
}>(
  releases: T[],
  currentVersion: string,
  routineUpdates: 'patch' | 'minor',
): { routine?: T; breaking?: T };
