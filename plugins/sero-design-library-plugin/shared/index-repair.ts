import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import type { DesignLibraryPaths } from './paths';
import { assertSafeId, isSafeId } from './paths';
import { writeJsonFile } from './state-io';

export type RepairIndexName = 'items' | 'designs' | 'gallery' | 'exports';

export interface PendingIndexRepair {
  index: RepairIndexName;
  id: string;
}

export interface FullIndexRepairRequest {
  requestedAt: number;
  attempts: number;
}

export interface FailedIndexRepair extends FullIndexRepairRequest {
  failedAt: number;
  error: string;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function normalizeFullIndexRepairRequest(value: unknown): FullIndexRepairRequest | null {
  const entry = object(value);
  if (!entry || typeof entry.requestedAt !== 'number') return null;
  return {
    requestedAt: entry.requestedAt,
    attempts: typeof entry.attempts === 'number' && Number.isInteger(entry.attempts)
      ? Math.max(0, entry.attempts)
      : 0,
  };
}

export function normalizeFailedIndexRepair(value: unknown): FailedIndexRepair | null {
  const request = normalizeFullIndexRepairRequest(value);
  const entry = object(value);
  if (!request || !entry || typeof entry.failedAt !== 'number' || typeof entry.error !== 'string') {
    return null;
  }
  return { ...request, failedAt: entry.failedAt, error: entry.error };
}

function repairFile(paths: DesignLibraryPaths, index: RepairIndexName, id: string): string {
  return path.join(paths.indexRepairsDir, index, `${assertSafeId(id, `${index} record id`)}.json`);
}

/** Record an index projection before its authoritative record can change. */
export async function markIndexRepair(
  paths: DesignLibraryPaths,
  index: RepairIndexName,
  id: string,
): Promise<void> {
  await writeJsonFile(repairFile(paths, index, id), { id });
}

export async function clearIndexRepair(
  paths: DesignLibraryPaths,
  index: RepairIndexName,
  id: string,
): Promise<void> {
  await rm(repairFile(paths, index, id), { force: true });
}

export async function withIndexRepair<T>(
  paths: DesignLibraryPaths,
  index: RepairIndexName,
  id: string,
  write: () => Promise<T>,
): Promise<T> {
  await markIndexRepair(paths, index, id);
  const result = await write();
  await clearIndexRepair(paths, index, id);
  return result;
}

/** Read only the small set of interrupted transactions, not every entity. */
export async function listPendingIndexRepairs(
  paths: DesignLibraryPaths,
): Promise<PendingIndexRepair[]> {
  const indexes: RepairIndexName[] = ['items', 'designs', 'gallery', 'exports'];
  const pending = await Promise.all(indexes.map(async (index) => {
    const entries = await readdir(path.join(paths.indexRepairsDir, index)).catch(() => []);
    return entries.flatMap((entry) => {
      if (!entry.endsWith('.json')) return [];
      const id = entry.slice(0, -'.json'.length);
      return isSafeId(id) ? [{ index, id }] : [];
    });
  }));
  return pending.flat();
}
