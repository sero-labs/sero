/**
 * Doctor check + repair registry.
 *
 * Built-in checks self-register via a side-effecting import of
 * `./checks/index.ts` performed once at runner load time.
 */

import type { DoctorCategory, DoctorCheck, DoctorRepair } from './types';

const checks: DoctorCheck[] = [];
const repairs = new Map<string, DoctorRepair>();

export function registerDoctorCheck(check: DoctorCheck): void {
  if (checks.some((c) => c.id === check.id)) {
    throw new Error(`duplicate check ${check.id}`);
  }
  checks.push(check);
  if (check.repair) {
    if (repairs.has(check.repair.id)) {
      throw new Error(`duplicate repair ${check.repair.id}`);
    }
    repairs.set(check.repair.id, check.repair);
  }
}

export function registerDoctorRepair(repair: DoctorRepair): void {
  if (repairs.has(repair.id)) {
    throw new Error(`duplicate repair ${repair.id}`);
  }
  repairs.set(repair.id, repair);
}

export interface ListChecksFilter {
  category?: DoctorCategory;
  /** Exclude `slow: true` checks. */
  quick?: boolean;
  /** Exclude `needsBootedApp: true` checks. */
  safe?: boolean;
}

export function listChecks(filter: ListChecksFilter = {}): DoctorCheck[] {
  return checks.filter((c) => {
    if (filter.category && c.category !== filter.category) return false;
    if (filter.quick && c.slow) return false;
    if (filter.safe && c.needsBootedApp) return false;
    return true;
  });
}

export function getRepair(id: string): DoctorRepair | undefined {
  return repairs.get(id);
}

/** Used by tests to reset state. Not exported from the package barrel. */
export function __resetRegistryForTests(): void {
  checks.length = 0;
  repairs.clear();
}
