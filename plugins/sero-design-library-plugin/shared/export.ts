import { isSafeId } from './paths';

export const EXPORT_SCHEMA_VERSION = 1;

export type ExportDestination = 'downloads' | 'workspace';
export type ExportStatus = 'running' | 'succeeded' | 'failed';

/** Lightweight reactive record for one export attempt. */
export interface ExportSummary {
  id: string;
  familyId: string;
  versionId: string;
  destination: ExportDestination;
  status: ExportStatus;
  createdAt: number;
  completedAt?: number;
  path?: string;
  error?: string;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function isExportDestination(value: unknown): value is ExportDestination {
  return value === 'downloads' || value === 'workspace';
}

export function normalizeExportSummary(value: unknown): ExportSummary | null {
  const entry = object(value);
  if (!entry || typeof entry.id !== 'string' || !isSafeId(entry.id)) return null;
  if (typeof entry.familyId !== 'string' || !isSafeId(entry.familyId)) return null;
  if (typeof entry.versionId !== 'string' || !isSafeId(entry.versionId)) return null;
  if (!isExportDestination(entry.destination)) return null;
  if (entry.status !== 'running' && entry.status !== 'succeeded' && entry.status !== 'failed') return null;
  return {
    id: entry.id,
    familyId: entry.familyId,
    versionId: entry.versionId,
    destination: entry.destination,
    status: entry.status,
    createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : 0,
    ...(typeof entry.completedAt === 'number' ? { completedAt: entry.completedAt } : {}),
    ...(typeof entry.path === 'string' ? { path: entry.path } : {}),
    ...(typeof entry.error === 'string' ? { error: entry.error } : {}),
  };
}
