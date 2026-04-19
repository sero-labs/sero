import path from 'path';
import type { SeroAppManifest } from '@/types/ipc';
import { discoverAppCandidates, isInstalledPluginPackagePath } from '@electron/features/apps/discovery';
import { readPluginDevSessionRecords } from './settings';
import type { PluginDevSessionRecord } from './types';

export interface PluginDevConflict {
  kind: 'built-in-app' | 'installed-plugin' | 'active-dev-session';
  appId: string;
  ownerPath?: string;
  ownerSessionId?: string;
  message: string;
}

interface ClassifyPluginDevConflictsParams {
  appId: string;
  sourcePath?: string | null;
  ignoreSessionId?: string | null;
  existingApps: SeroAppManifest[];
  sessionRecords?: PluginDevSessionRecord[];
}

function normalizePath(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? path.resolve(value) : null;
}

function dedupeConflicts(conflicts: PluginDevConflict[]): PluginDevConflict[] {
  const seen = new Set<string>();
  const deduped: PluginDevConflict[] = [];

  for (const conflict of conflicts) {
    const key = [
      conflict.kind,
      conflict.appId,
      conflict.ownerSessionId ?? '',
      conflict.ownerPath ?? '',
    ].join('::');

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(conflict);
  }

  return deduped;
}

function createAppConflict(kind: PluginDevConflict['kind'], appId: string, ownerPath: string): PluginDevConflict {
  const ownerLabel = kind === 'installed-plugin' ? 'installed plugin' : 'built-in app';
  return {
    kind,
    appId,
    ownerPath,
    message: `app id "${appId}" is already used by ${ownerLabel} at ${ownerPath}.`,
  };
}

function createDevSessionConflict(appId: string, record: PluginDevSessionRecord): PluginDevConflict {
  return {
    kind: 'active-dev-session',
    appId,
    ownerPath: record.sourcePath,
    ownerSessionId: record.sessionId,
    message: `app id "${appId}" is already owned by active local plugin development session ${record.sessionId} at ${record.sourcePath}.`,
  };
}

export function isActivePluginDevSessionRecord(record: PluginDevSessionRecord): boolean {
  return record.status !== 'broken';
}

export function getActivePluginDevSessionRecords(
  records: PluginDevSessionRecord[] = readPluginDevSessionRecords(),
): PluginDevSessionRecord[] {
  return records.filter(isActivePluginDevSessionRecord);
}

export function classifyPluginDevConflicts({
  appId,
  sourcePath,
  ignoreSessionId,
  existingApps,
  sessionRecords = readPluginDevSessionRecords(),
}: ClassifyPluginDevConflictsParams): PluginDevConflict[] {
  const normalizedSourcePath = normalizePath(sourcePath);
  const activeSessionRecords = getActivePluginDevSessionRecords(sessionRecords);
  const activeSessionPaths = new Set(activeSessionRecords.map((record) => path.resolve(record.sourcePath)));
  const conflicts: PluginDevConflict[] = [];

  for (const record of activeSessionRecords) {
    if (record.expectedAppId !== appId) continue;
    if (ignoreSessionId && record.sessionId === ignoreSessionId) continue;
    conflicts.push(createDevSessionConflict(appId, record));
  }

  for (const manifest of existingApps) {
    if (manifest.id !== appId) continue;

    const ownerPath = path.resolve(manifest.packagePath);
    if (normalizedSourcePath && ownerPath === normalizedSourcePath) continue;
    if (activeSessionPaths.has(ownerPath)) continue;

    conflicts.push(createAppConflict(
      isInstalledPluginPackagePath(ownerPath) ? 'installed-plugin' : 'built-in-app',
      appId,
      ownerPath,
    ));
  }

  return dedupeConflicts(conflicts);
}

export async function classifyPluginDevConflictsFromDiscovery(
  params: Omit<ClassifyPluginDevConflictsParams, 'existingApps' | 'sessionRecords'> & {
    sessionRecords?: PluginDevSessionRecord[];
  },
): Promise<PluginDevConflict[]> {
  return classifyPluginDevConflicts({
    ...params,
    existingApps: await discoverAppCandidates(),
  });
}

export async function assertNoPluginDevConflicts(
  params: Omit<ClassifyPluginDevConflictsParams, 'existingApps' | 'sessionRecords'> & {
    sessionRecords?: PluginDevSessionRecord[];
  },
): Promise<void> {
  const conflicts = await classifyPluginDevConflictsFromDiscovery(params);
  if (conflicts.length === 0) return;

  throw new Error(`Cannot activate local plugin development: ${conflicts[0]!.message}`);
}
