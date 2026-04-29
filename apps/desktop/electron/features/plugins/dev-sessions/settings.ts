import { getSeroSettings, readSettings, writeSettings } from '@electron/shared/settings/settings-helpers';
import type {
  PluginDevSessionRecord,
  PluginDevSessionRecordMap,
} from './types';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeStatus(value: unknown): PluginDevSessionRecord['status'] {
  switch (value) {
    case 'starting':
    case 'active':
    case 'needs-attention':
    case 'broken':
      return value;
    default:
      return 'broken';
  }
}

function normalizeUiMode(value: unknown): PluginDevSessionRecord['uiMode'] {
  switch (value) {
    case 'dev-server':
    case 'built-fallback':
    case 'backend-only':
    case 'unavailable':
      return value;
    default:
      return 'unavailable';
  }
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback;
}

function readPluginDevSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const seroSettings = getSeroSettings(settings);
  const pluginDev = seroSettings.pluginDev;
  return isObjectRecord(pluginDev) ? pluginDev : {};
}

function readPersistedSessionEntries(settings: Record<string, unknown>): Record<string, unknown> {
  const pluginDevSettings = readPluginDevSettings(settings);
  const sessions = pluginDevSettings.sessions;
  return isObjectRecord(sessions) ? sessions : {};
}

function normalizeSessionRecord(
  sessionId: string,
  value: unknown,
): PluginDevSessionRecord | null {
  if (!isObjectRecord(value)) return null;

  const now = new Date().toISOString();
  const sourcePath = readString(value.sourcePath);
  if (!sourcePath) {
    console.warn(`[plugin-dev-settings] Ignoring session "${sessionId}": missing sourcePath.`);
    return null;
  }

  return {
    sessionId,
    sourcePath,
    expectedAppId: readString(value.expectedAppId),
    lastKnownName: readString(value.lastKnownName),
    status: normalizeStatus(value.status),
    uiMode: normalizeUiMode(value.uiMode),
    remoteEntryOverride: readString(value.remoteEntryOverride),
    lastError: readString(value.lastError),
    createdAt: normalizeTimestamp(value.createdAt, now),
    updatedAt: normalizeTimestamp(value.updatedAt, now),
  };
}

function serializeSessionRecord(record: PluginDevSessionRecord): Record<string, unknown> {
  return {
    sessionId: record.sessionId,
    sourcePath: record.sourcePath,
    expectedAppId: record.expectedAppId,
    lastKnownName: record.lastKnownName,
    status: record.status,
    uiMode: record.uiMode,
    remoteEntryOverride: record.remoteEntryOverride,
    lastError: record.lastError,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function sortRecords(records: PluginDevSessionRecord[]): PluginDevSessionRecord[] {
  return [...records].sort((left, right) => {
    const updatedDelta = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    if (updatedDelta !== 0) return updatedDelta;

    const createdDelta = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    if (createdDelta !== 0) return createdDelta;

    return left.sessionId.localeCompare(right.sessionId);
  });
}

export function readPluginDevSessionRecordMap(): PluginDevSessionRecordMap {
  const settings = readSettings();
  const persistedEntries = readPersistedSessionEntries(settings);
  const records: PluginDevSessionRecordMap = {};

  for (const [sessionId, value] of Object.entries(persistedEntries)) {
    const record = normalizeSessionRecord(sessionId, value);
    if (!record) continue;
    records[record.sessionId] = record;
  }

  return records;
}

export function readPluginDevSessionRecords(): PluginDevSessionRecord[] {
  return sortRecords(Object.values(readPluginDevSessionRecordMap()));
}

export function writePluginDevSessionRecords(records: Iterable<PluginDevSessionRecord>): void {
  const settings = readSettings();
  const seroSettings = getSeroSettings(settings);
  const pluginDevSettings = readPluginDevSettings(settings);
  const nextSessions: Record<string, unknown> = {};

  for (const record of sortRecords([...records])) {
    nextSessions[record.sessionId] = serializeSessionRecord(record);
  }

  settings.sero = {
    ...seroSettings,
    pluginDev: {
      ...pluginDevSettings,
      sessions: nextSessions,
    },
  };

  writeSettings(settings);
}

export function upsertPluginDevSessionRecord(record: PluginDevSessionRecord): void {
  const records = readPluginDevSessionRecordMap();
  records[record.sessionId] = record;
  writePluginDevSessionRecords(Object.values(records));
}

export function removePluginDevSessionRecord(sessionId: string): boolean {
  const records = readPluginDevSessionRecordMap();
  if (!records[sessionId]) {
    return false;
  }

  delete records[sessionId];
  writePluginDevSessionRecords(Object.values(records));
  return true;
}
