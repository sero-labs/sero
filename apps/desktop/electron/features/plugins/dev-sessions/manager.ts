import { randomUUID } from 'crypto';
import path from 'path';
import type { SeroAppManifest } from '@/types/ipc';
import { discoverAppCandidates } from '@electron/features/apps/discovery';
import { reconcileActiveDevSessionProjection } from './activation';
import { classifyPluginDevConflicts } from './conflicts';
import { ensurePluginDevServer, stopPluginDevServer } from './dev-server';
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

function normalizeSourcePath(sourcePath: string): string {
  return path.resolve(sourcePath);
}

function createSessionId(): string {
  return `dev_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

function createSessionSeed(
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

  async start(sourcePath: string): Promise<PluginDevSessionRecord> {
    await this.initialize();

    const validated = await validatePluginDevSourceManifest(sourcePath);
    const existingSession = this.findSessionBySourcePath(validated.sourcePath);
    const conflicts = classifyPluginDevConflicts({
      appId: validated.manifest.id,
      sourcePath: validated.sourcePath,
      ignoreSessionId: existingSession?.sessionId,
      existingApps: await discoverAppCandidates(),
      sessionRecords: [...this.sessions.values()],
    });

    if (conflicts.length > 0) {
      throw new Error(`Cannot activate local plugin development: ${conflicts[0]!.message}`);
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
    const nextRecord = createValidatedPluginDevSessionRecord(
      createSessionSeed(validated.sourcePath, existingSession),
      {
        manifest: resolvedManifest,
        remoteEntryOverride: devServerResult.remoteEntryOverride,
        uiMode: devServerResult.uiMode,
        error: devServerResult.error ?? null,
      },
    );
    const nextActiveManifests = new Map(this.activeManifests);
    nextActiveManifests.set(nextRecord.sessionId, resolvedManifest);

    this.persistSession(nextRecord);

    try {
      await applyPluginDevSessionRefreshEffects({
        activeManifests: [...nextActiveManifests.values()],
        appId: resolvedManifest.id,
        event: {
          type: 'changed',
          pluginId: resolvedManifest.id,
          manifest: resolvedManifest,
          reason: existingSession ? 'dev-session-refreshed' : 'dev-session-started',
        },
      });
    } catch (error) {
      this.restoreSessionState(nextRecord.sessionId, existingSession);
      try {
        await reconcileActiveDevSessionProjection([...this.activeManifests.values()]);
      } catch (rollbackError) {
        console.warn('[plugin-dev] Failed to restore projection after start failure:', rollbackError);
      }
      throw error;
    }

    this.replaceActiveManifests(nextActiveManifests);

    if (devServerResult.uiMode !== 'dev-server') {
      this.stopPluginDevServerBestEffort(validated.sourcePath);
    }

    return cloneSession(nextRecord);
  }

  async stop(sessionId: string): Promise<void> {
    await this.initialize();

    const record = this.getSessionOrThrow(sessionId);
    const activeManifest = this.activeManifests.get(sessionId) ?? null;

    if (activeManifest) {
      const nextActiveManifests = new Map(this.activeManifests);
      nextActiveManifests.delete(sessionId);

      await applyPluginDevSessionRefreshEffects({
        activeManifests: [...nextActiveManifests.values()],
        appId: activeManifest.id,
        event: {
          type: 'changed',
          pluginId: activeManifest.id,
          reason: 'dev-session-stopped',
        },
      });

      this.replaceActiveManifests(nextActiveManifests);
    }

    this.sessions.delete(sessionId);
    this.watcher.unwatch(sessionId);
    this.persistSessions();
    this.stopPluginDevServerBestEffort(record.sourcePath);
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

  private findSessionBySourcePath(sourcePath: string): PluginDevSessionRecord | undefined {
    const normalizedSourcePath = normalizeSourcePath(sourcePath);
    return [...this.sessions.values()].find((record) => normalizeSourcePath(record.sourcePath) === normalizedSourcePath);
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
        this.replaceActiveManifests(nextActiveManifests);
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
    this.persistSessions();
  }

  private persistSessions(): void {
    writePluginDevSessionRecords([...this.sessions.values()]);
  }

  private restoreSessionState(
    sessionId: string,
    previousRecord?: PluginDevSessionRecord,
  ): void {
    if (previousRecord) {
      this.sessions.set(sessionId, previousRecord);
      this.syncWatcher(previousRecord);
      this.persistSessions();
      return;
    }

    this.sessions.delete(sessionId);
    this.watcher.unwatch(sessionId);
    this.persistSessions();
  }

  private replaceActiveManifests(nextActiveManifests: Map<string, SeroAppManifest>): void {
    this.activeManifests.clear();
    for (const [sessionId, manifest] of nextActiveManifests.entries()) {
      this.activeManifests.set(sessionId, manifest);
    }
  }

  private syncWatcher(record: PluginDevSessionRecord): void {
    if (isActiveSession(record)) {
      this.watcher.watch(record.sessionId, record.sourcePath);
      return;
    }

    this.watcher.unwatch(record.sessionId);
  }

  private stopPluginDevServerBestEffort(sourcePath: string): void {
    void stopPluginDevServer(sourcePath).catch((error) => {
      console.warn(`[plugin-dev] Failed to stop dev server for ${sourcePath}:`, error);
    });
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

    this.replaceActiveManifests(new Map(activeManifests));
  }
}

export const pluginDevSessionManager = new PluginDevSessionManager();
