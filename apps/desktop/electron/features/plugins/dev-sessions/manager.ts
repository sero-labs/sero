import type { SeroAppManifest } from '@/types/ipc';
import { discoverAppCandidates } from '@electron/features/apps/discovery';
import { reconcileActiveDevSessionProjection } from './activation';
import { classifyPluginDevConflicts } from './conflicts';
import { ensurePluginDevServer } from './dev-server';
import {
  applyPluginDevServerResultToManifest,
  validatePluginDevSourceManifest,
} from './manifest';
import {
  readPluginDevSessionRecords,
  writePluginDevSessionRecords,
} from './settings';
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
  options: {
    manifest: SeroAppManifest;
    remoteEntryOverride: string | null;
    uiMode: PluginDevSessionRecord['uiMode'];
    error?: string | null;
  },
): PluginDevSessionRecord {
  return {
    ...record,
    expectedAppId: options.manifest.id,
    lastKnownName: options.manifest.name,
    status: options.error ? 'needs-attention' : 'active',
    uiMode: options.uiMode,
    remoteEntryOverride: options.remoteEntryOverride,
    lastError: options.error ?? null,
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
    const activeManifests: SeroAppManifest[] = [];

    for (const record of persistedRecords) {
      if (record.status === 'broken') {
        nextRecords.push(record);
        continue;
      }

      try {
        const validated = await validatePluginDevSourceManifest(record.sourcePath, {
          expectedAppId: record.expectedAppId,
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

        const devServerResult = await ensurePluginDevServer({
          sourcePath: validated.sourcePath,
          declaredDevPort: validated.declaredDevPort,
          command: validated.devCommand,
          hasDeclaredUi: validated.hasDeclaredUi,
          hasBuiltUi: validated.hasBuiltUi,
        });
        const resolvedManifest = applyPluginDevServerResultToManifest(
          validated.manifest,
          devServerResult,
        );

        nextRecords.push(createValidatedRecord(record, {
          manifest: resolvedManifest,
          remoteEntryOverride: devServerResult.remoteEntryOverride,
          uiMode: devServerResult.uiMode,
          error: devServerResult.error ?? null,
        }));
        activeManifests.push(resolvedManifest);
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
