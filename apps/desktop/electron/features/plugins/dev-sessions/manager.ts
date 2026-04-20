import type { SeroAppManifest } from '@/types/ipc';
import { discoverAppCandidates } from '@electron/features/apps/discovery';
import { broadcastPluginEvent } from '@electron/ipc/integrations/plugin-events';
import { reconcileActiveDevSessionProjection } from './activation';
import {
  buildBootstrapSessionEvent,
  hasManifestProjectionChange,
  hasSessionPresentationChange,
  resolveBootstrapSessionState,
} from './bootstrap';
import { classifyPluginDevConflicts } from './conflicts';
import {
  ensurePluginDevServer,
  stopAllPluginDevServers,
  stopPluginDevServer,
} from './dev-server';
import {
  applyPluginDevServerResultToManifest,
  validatePluginDevSourceManifest,
} from './manifest';
import {
  compareSessions,
  cloneSession,
  createSessionSeed,
  isActiveSession,
  normalizeSourcePath,
} from './record-helpers';
import {
  applyPluginDevSessionRefreshEffects,
  createBrokenPluginDevSessionRecord,
  createSoftFailurePluginDevSessionRecord,
  createValidatedPluginDevSessionRecord,
  refreshPluginDevSession,
  type RefreshPluginDevSessionOptions,
  type RefreshPluginDevSessionResult,
} from './refresh';
import {
  readPluginDevSessionRecords,
  writePluginDevSessionRecords,
} from './settings';
import type { PluginDevSessionRecord } from './types';
import { PluginDevSessionWatcher } from './watcher';

export class PluginDevSessionManager {
  private readonly sessions = new Map<string, PluginDevSessionRecord>();
  private readonly activeManifests = new Map<string, SeroAppManifest>();
  private readonly watcher = new PluginDevSessionWatcher((sessionId) => {
    void this.refresh(sessionId, { reason: 'file-change' }).catch((error) => {
      console.warn(`[plugin-dev] Auto-refresh failed for ${sessionId}:`, error);
    });
  });
  private readonly sessionTasks = new Map<string, Promise<unknown>>();
  private readonly bootstrapTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private initialized = false;
  private initializationTask: Promise<void> | null = null;
  private disposed = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializationTask) {
      return this.initializationTask;
    }

    this.disposed = false;
    this.initializationTask = (async () => {
      const bootstrapProbeSessionIds = await this.bootstrapPersistedSessions();
      this.initialized = true;
      this.scheduleBootstrapProbes(bootstrapProbeSessionIds);
    })();

    try {
      await this.initializationTask;
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
    return this.enqueueSessionTask(normalizeSourcePath(sourcePath), async () => {
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
        appId: validated.manifest.id,
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
        if (!existingSession && devServerResult.uiMode === 'dev-server') {
          this.stopPluginDevServerBestEffort(validated.sourcePath);
        }
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
    });
  }

  async stop(sessionId: string): Promise<void> {
    await this.initialize();
    this.clearBootstrapProbe(sessionId);
    await this.enqueueSessionTask(sessionId, async () => {
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
    });
  }

  async refresh(
    sessionId: string,
    options: RefreshPluginDevSessionOptions = { reason: 'manual' },
  ): Promise<PluginDevSessionRecord> {
    await this.initialize();
    return this.enqueueSessionTask(sessionId, () => this.runRefresh(sessionId, options));
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    for (const timer of this.bootstrapTimers.values()) {
      clearTimeout(timer);
    }
    this.bootstrapTimers.clear();
    this.watcher.dispose();
    this.sessions.clear();
    this.activeManifests.clear();
    this.sessionTasks.clear();
    this.initialized = false;
    this.initializationTask = null;
    await stopAllPluginDevServers();
  }

  private async enqueueSessionTask<T>(
    sessionId: string,
    taskFactory: () => Promise<T>,
  ): Promise<T> {
    const previousTask = this.sessionTasks.get(sessionId) ?? Promise.resolve();
    const task = previousTask
      .catch(() => undefined)
      .then(() => taskFactory());

    this.sessionTasks.set(sessionId, task);

    try {
      return await task;
    } finally {
      if (this.sessionTasks.get(sessionId) === task) {
        this.sessionTasks.delete(sessionId);
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
    const latest = this.sessions.get(sessionId);

    if (this.disposed || latest !== current) {
      this.stopPluginDevServerBestEffort(current.sourcePath);
      return cloneSession(current);
    }

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

  private scheduleBootstrapProbes(sessionIds: string[]): void {
    for (const sessionId of sessionIds) {
      if (this.bootstrapTimers.has(sessionId)) {
        continue;
      }

      const timer = setTimeout(() => {
        this.bootstrapTimers.delete(sessionId);
        if (this.disposed) {
          return;
        }

        void this.enqueueSessionTask(sessionId, () => this.runBootstrapProbe(sessionId)).catch((error) => {
          console.warn(`[plugin-dev] Failed async bootstrap probe for ${sessionId}:`, error);
        });
      }, 0);

      this.bootstrapTimers.set(sessionId, timer);
    }
  }

  private clearBootstrapProbe(sessionId: string): void {
    const timer = this.bootstrapTimers.get(sessionId);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    this.bootstrapTimers.delete(sessionId);
  }

  private async runBootstrapProbe(sessionId: string): Promise<void> {
    const current = this.sessions.get(sessionId);
    if (!current || current.status !== 'starting') {
      return;
    }

    const currentManifest = this.activeManifests.get(sessionId) ?? null;
    const nextState = await refreshPluginDevSession(current, { reason: 'manual' });
    const latest = this.sessions.get(sessionId);

    if (this.disposed || latest !== current) {
      this.stopPluginDevServerBestEffort(current.sourcePath);
      return;
    }

    const nextManifest = this.resolveBootstrapNextManifest(currentManifest, nextState);
    const nextActiveManifests = new Map(this.activeManifests);
    if (nextManifest) {
      nextActiveManifests.set(sessionId, nextManifest);
    } else if (nextState.effect === 'deactivated') {
      nextActiveManifests.delete(sessionId);
    }

    const manifestChanged = hasManifestProjectionChange(currentManifest, nextManifest);
    const sessionChanged = hasSessionPresentationChange(current, nextState.record);
    if (!manifestChanged && !sessionChanged) {
      return;
    }

    this.persistSession(nextState.record);

    if (manifestChanged && nextState.appId) {
      try {
        await applyPluginDevSessionRefreshEffects({
          activeManifests: [...nextActiveManifests.values()],
          appId: nextState.appId,
          event: nextState.event ?? buildBootstrapSessionEvent(current, nextState.record, nextManifest),
        });
        this.replaceActiveManifests(nextActiveManifests);
      } catch (error) {
        console.warn(`[plugin-dev] Failed to apply bootstrap probe effects for ${sessionId}:`, error);
        this.persistSession(current);
        try {
          await reconcileActiveDevSessionProjection([...this.activeManifests.values()]);
        } catch (rollbackError) {
          console.warn(`[plugin-dev] Failed to restore projection after bootstrap probe failure for ${sessionId}:`, rollbackError);
        }
      }
      return;
    }

    this.replaceActiveManifests(nextActiveManifests);

    const event = nextState.event ?? buildBootstrapSessionEvent(current, nextState.record, nextManifest);
    if (event) {
      broadcastPluginEvent(event);
    }
  }

  private resolveBootstrapNextManifest(
    currentManifest: SeroAppManifest | null,
    nextState: RefreshPluginDevSessionResult,
  ): SeroAppManifest | null {
    if (nextState.effect === 'deactivated') {
      return null;
    }
    if (nextState.activeManifest) {
      return nextState.activeManifest;
    }
    return currentManifest;
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

  private async bootstrapPersistedSessions(): Promise<string[]> {
    const persistedRecords = readPluginDevSessionRecords();
    const discoveryCandidates = await discoverAppCandidates();
    const nextRecords: PluginDevSessionRecord[] = [];
    const activeManifests: Array<[string, SeroAppManifest]> = [];
    const bootstrapProbeSessionIds: string[] = [];

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

        const nextState = resolveBootstrapSessionState(record, validated);
        nextRecords.push(nextState.record);
        activeManifests.push([record.sessionId, nextState.manifest]);
        if (nextState.shouldProbeDevServer) {
          bootstrapProbeSessionIds.push(record.sessionId);
        }
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
    return bootstrapProbeSessionIds;
  }
}

export const pluginDevSessionManager = new PluginDevSessionManager();
