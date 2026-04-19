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
  applyPluginDevSessionRefreshEffects,
  createBrokenPluginDevSessionRecord,
  createSoftFailurePluginDevSessionRecord,
  createValidatedPluginDevSessionRecord,
  refreshPluginDevSession,
  type RefreshPluginDevSessionOptions,
} from './refresh';
import {
  readPluginDevSessionRecords,
  writePluginDevSessionRecords,
} from './settings';
import type { PluginDevSessionRecord } from './types';
import { PluginDevSessionWatcher } from './watcher';

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

function isActiveSession(record: PluginDevSessionRecord): boolean {
  return record.status !== 'broken';
}

export class PluginDevSessionManager {
  private readonly sessions = new Map<string, PluginDevSessionRecord>();
  private readonly activeManifests = new Map<string, SeroAppManifest>();
  private readonly watcher = new PluginDevSessionWatcher((sessionId) => {
    void this.refresh(sessionId, { reason: 'file-change' }).catch((error) => {
      console.warn(`[plugin-dev] Auto-refresh failed for ${sessionId}:`, error);
    });
  });
  private readonly refreshTasks = new Map<string, Promise<PluginDevSessionRecord>>();
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

  async refresh(
    sessionId: string,
    options: RefreshPluginDevSessionOptions = { reason: 'manual' },
  ): Promise<PluginDevSessionRecord> {
    await this.initialize();

    const previousTask = this.refreshTasks.get(sessionId) ?? Promise.resolve(this.getSessionOrThrow(sessionId));
    const task = previousTask
      .catch(() => undefined)
      .then(() => this.runRefresh(sessionId, options));

    this.refreshTasks.set(sessionId, task);

    try {
      return await task;
    } finally {
      if (this.refreshTasks.get(sessionId) === task) {
        this.refreshTasks.delete(sessionId);
      }
    }
  }

  private getSessionOrThrow(sessionId: string): PluginDevSessionRecord {
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw new Error(`Unknown local plugin development session: ${sessionId}`);
    }
    return record;
  }

  private async runRefresh(
    sessionId: string,
    options: RefreshPluginDevSessionOptions,
  ): Promise<PluginDevSessionRecord> {
    const current = this.getSessionOrThrow(sessionId);
    const nextState = await refreshPluginDevSession(current, options);

    if (nextState.effect !== 'none' && nextState.appId) {
      const nextActiveManifests = new Map(this.activeManifests);
      if (nextState.activeManifest) {
        nextActiveManifests.set(sessionId, nextState.activeManifest);
      } else {
        nextActiveManifests.delete(sessionId);
      }

      try {
        await applyPluginDevSessionRefreshEffects({
          activeManifests: [...nextActiveManifests.values()],
          appId: nextState.appId,
          event: nextState.event,
        });
        this.activeManifests.clear();
        for (const [key, manifest] of nextActiveManifests.entries()) {
          this.activeManifests.set(key, manifest);
        }
      } catch (error) {
        console.warn(`[plugin-dev] Failed to apply refresh effects for ${sessionId}:`, error);
        try {
          await reconcileActiveDevSessionProjection([...this.activeManifests.values()]);
        } catch (rollbackError) {
          console.warn(`[plugin-dev] Failed to restore last-known-good projection for ${sessionId}:`, rollbackError);
        }
        const fallbackRecord = createSoftFailurePluginDevSessionRecord(current, error);
        this.persistSession(fallbackRecord);
        return cloneSession(fallbackRecord);
      }
    }

    this.persistSession(nextState.record);
    return cloneSession(nextState.record);
  }

  private persistSession(record: PluginDevSessionRecord): void {
    this.sessions.set(record.sessionId, record);
    this.syncWatcher(record);
    writePluginDevSessionRecords(this.sessions.values());
  }

  private syncWatcher(record: PluginDevSessionRecord): void {
    if (isActiveSession(record)) {
      this.watcher.watch(record.sessionId, record.sourcePath);
      return;
    }

    this.watcher.unwatch(record.sessionId);
  }

  private async bootstrapPersistedSessions(): Promise<void> {
    const persistedRecords = readPluginDevSessionRecords();
    const discoveryCandidates = await discoverAppCandidates();
    const nextRecords: PluginDevSessionRecord[] = [];
    const activeManifests: Array<[string, SeroAppManifest]> = [];

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
        const nextRecord = createValidatedPluginDevSessionRecord(record, {
          manifest: resolvedManifest,
          remoteEntryOverride: devServerResult.remoteEntryOverride,
          uiMode: devServerResult.uiMode,
          error: devServerResult.error ?? null,
        });

        nextRecords.push(nextRecord);
        activeManifests.push([record.sessionId, resolvedManifest]);
      } catch (error) {
        nextRecords.push(createBrokenPluginDevSessionRecord(record, error));
      }
    }

    writePluginDevSessionRecords(nextRecords);
    await reconcileActiveDevSessionProjection(activeManifests.map(([, manifest]) => manifest));

    this.sessions.clear();
    for (const record of nextRecords) {
      this.sessions.set(record.sessionId, record);
      this.syncWatcher(record);
    }

    this.activeManifests.clear();
    for (const [sessionId, manifest] of activeManifests) {
      this.activeManifests.set(sessionId, manifest);
    }
  }
}

export const pluginDevSessionManager = new PluginDevSessionManager();
