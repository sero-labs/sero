import { discoverAppCandidates } from '@electron/features/apps/discovery';
import {
  reconcileActiveDevSessionProjection,
} from './activation';
import {
  classifyPluginDevConflicts,
} from './conflicts';
import {
  readPluginDevSessionRecords,
  writePluginDevSessionRecords,
} from './settings';
import {
  validatePluginDevSourceManifest,
} from './manifest';
import type { PluginDevSessionRecord } from './types';

function compareSessions(left: PluginDevSessionRecord, right: PluginDevSessionRecord): number {
  const updatedDelta = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  if (updatedDelta !== 0) return updatedDelta;

  const createdDelta = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  if (createdDelta !== 0) return createdDelta;

  return left.sessionId.localeCompare(right.sessionId);
}

function cloneSession(record: PluginDevSessionRecord): PluginDevSessionRecord {
  return { ...record };
}

function createBrokenRecord(record: PluginDevSessionRecord, error: unknown): PluginDevSessionRecord {
  const message = error instanceof Error ? error.message : 'Unknown local plugin development error';
  return {
    ...record,
    status: 'broken',
    uiMode: 'unavailable',
    remoteEntryOverride: null,
    lastError: message,
    updatedAt: new Date().toISOString(),
  };
}

function createValidatedRecord(
  record: PluginDevSessionRecord,
  validated: Awaited<ReturnType<typeof validatePluginDevSourceManifest>>,
): PluginDevSessionRecord {
  return {
    ...record,
    expectedAppId: validated.manifest.id,
    lastKnownName: validated.manifest.name,
    status: record.status === 'needs-attention' ? 'needs-attention' : 'active',
    lastError: record.status === 'needs-attention' ? record.lastError : null,
    updatedAt: new Date().toISOString(),
  };
}

export class PluginDevSessionManager {
  private readonly sessions = new Map<string, PluginDevSessionRecord>();
  private initialized = false;
  private initializationTask: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializationTask) {
      return this.initializationTask;
    }

    this.initializationTask = this.bootstrapPersistedSessions();

    try {
      await this.initializationTask;
      this.initialized = true;
    } finally {
      this.initializationTask = null;
    }
  }

  async list(): Promise<PluginDevSessionRecord[]> {
    await this.initialize();
    return [...this.sessions.values()]
      .sort(compareSessions)
      .map(cloneSession);
  }

  private async bootstrapPersistedSessions(): Promise<void> {
    const persistedRecords = readPluginDevSessionRecords();
    const discoveryCandidates = await discoverAppCandidates();
    const nextRecords: PluginDevSessionRecord[] = [];
    const activeManifests: Awaited<ReturnType<typeof validatePluginDevSourceManifest>>['manifest'][] = [];

    for (const record of persistedRecords) {
      if (record.status === 'broken') {
        nextRecords.push(record);
        continue;
      }

      try {
        const validated = await validatePluginDevSourceManifest(record.sourcePath, {
          expectedAppId: record.expectedAppId,
          remoteEntryOverride: record.remoteEntryOverride,
        });
        const conflicts = classifyPluginDevConflicts({
          appId: validated.manifest.id,
          sourcePath: validated.sourcePath,
          ignoreSessionId: record.sessionId,
          existingApps: discoveryCandidates,
          sessionRecords: persistedRecords,
        });

        if (conflicts.length > 0) {
          throw new Error(conflicts[0]!.message);
        }

        nextRecords.push(createValidatedRecord(record, validated));
        activeManifests.push(validated.manifest);
      } catch (error) {
        nextRecords.push(createBrokenRecord(record, error));
      }
    }

    writePluginDevSessionRecords(nextRecords);
    await reconcileActiveDevSessionProjection(activeManifests);

    this.sessions.clear();
    for (const record of nextRecords) {
      this.sessions.set(record.sessionId, record);
    }
  }
}

export const pluginDevSessionManager = new PluginDevSessionManager();
