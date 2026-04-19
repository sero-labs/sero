import {
  readPluginDevSessionRecords,
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

export class PluginDevSessionManager {
  private readonly sessions = new Map<string, PluginDevSessionRecord>();
  private initialized = false;
  private initializationTask: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializationTask) {
      return this.initializationTask;
    }

    this.initializationTask = (async () => {
      this.loadPersistedSessions();
      this.initialized = true;
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

  private loadPersistedSessions(): void {
    const records = readPluginDevSessionRecords();
    this.sessions.clear();

    for (const record of records) {
      this.sessions.set(record.sessionId, record);
    }
  }
}

export const pluginDevSessionManager = new PluginDevSessionManager();
