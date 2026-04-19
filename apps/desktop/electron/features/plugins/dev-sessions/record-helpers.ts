import { randomUUID } from 'crypto';
import path from 'path';
import type { PluginDevSessionRecord } from './types';

export function compareSessions(left: PluginDevSessionRecord, right: PluginDevSessionRecord): number {
  const updatedDelta = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  if (updatedDelta !== 0) return updatedDelta;

  const createdDelta = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  if (createdDelta !== 0) return createdDelta;

  return left.sessionId.localeCompare(right.sessionId);
}

export function cloneSession(record: PluginDevSessionRecord): PluginDevSessionRecord {
  return { ...record };
}

export function isActiveSession(record: PluginDevSessionRecord): boolean {
  return record.status !== 'broken';
}

export function normalizeSourcePath(sourcePath: string): string {
  return path.resolve(sourcePath);
}

function createSessionId(): string {
  return `dev_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

export function createSessionSeed(
  sourcePath: string,
  previousRecord?: PluginDevSessionRecord,
): PluginDevSessionRecord {
  if (previousRecord) {
    return {
      ...previousRecord,
      sourcePath: normalizeSourcePath(sourcePath),
    };
  }

  const now = new Date().toISOString();
  return {
    sessionId: createSessionId(),
    sourcePath: normalizeSourcePath(sourcePath),
    expectedAppId: null,
    lastKnownName: null,
    status: 'starting',
    uiMode: 'unavailable',
    remoteEntryOverride: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}
