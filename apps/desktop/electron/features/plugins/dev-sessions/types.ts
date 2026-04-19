import type {
  PluginDevSessionIPC,
  PluginDevSessionStatus,
  PluginDevSessionUiMode,
} from '@sero-ai/common';

/**
 * Persisted local plugin development session record.
 *
 * Stored under `settings.sero.pluginDev.sessions[sessionId]` in the active
 * profile's settings.json so dev sessions remain distinct from installed
 * plugins and workspace roots.
 */
export interface PluginDevSessionRecord {
  sessionId: string;
  sourcePath: string;
  expectedAppId: string | null;
  lastKnownName: string | null;
  status: PluginDevSessionStatus;
  uiMode: PluginDevSessionUiMode;
  remoteEntryOverride: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PluginDevSessionRecordMap = Record<string, PluginDevSessionRecord>;

export function toPluginDevSessionIPC(record: PluginDevSessionRecord): PluginDevSessionIPC {
  return {
    sessionId: record.sessionId,
    appId: record.expectedAppId,
    name: record.lastKnownName,
    sourcePath: record.sourcePath,
    status: record.status,
    uiMode: record.uiMode,
    remoteEntryOverride: record.remoteEntryOverride,
    lastError: record.lastError,
    updatedAt: record.updatedAt,
  };
}
