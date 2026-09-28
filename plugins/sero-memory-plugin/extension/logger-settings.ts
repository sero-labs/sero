import { readFileSync } from 'node:fs';
import path from 'node:path';

import { resolveAgentDir } from './agent-dir';

export interface MemoryLoggingSettings {
  maxBytesPerFile: number;
  maxFilesPerDay: number;
  retentionDays: number;
  maxPayloadChars: number;
}

export const DEFAULT_MEMORY_LOGGING_SETTINGS: MemoryLoggingSettings = {
  maxBytesPerFile: 2 * 1024 * 1024,
  maxFilesPerDay: 3,
  retentionDays: 14,
  maxPayloadChars: 4_096,
};

const SETTINGS_CACHE_TTL_MS = 5_000;
let cachedSettings: MemoryLoggingSettings | null = null;
let lastReadAt = 0;
let lastSettingsPath = '';

function normalizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
}

function getSettingsPath(): string {
  return path.join(resolveAgentDir(), 'settings.json');
}

function readSettingsFile(): Record<string, unknown> {
  const settingsPath = getSettingsPath();
  try {
    const raw = readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function getObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function getMemoryLoggingSettingsSync(): MemoryLoggingSettings {
  const now = Date.now();
  const settingsPath = getSettingsPath();
  if (cachedSettings && lastSettingsPath === settingsPath && now - lastReadAt < SETTINGS_CACHE_TTL_MS) {
    return cachedSettings;
  }

  const settings = readSettingsFile();
  const sero = getObject(settings.sero);
  const memory = getObject(sero.memory);
  const logging = getObject(memory.logging);

  cachedSettings = {
    maxBytesPerFile: normalizePositiveInteger(
      logging.maxBytesPerFile,
      DEFAULT_MEMORY_LOGGING_SETTINGS.maxBytesPerFile,
    ),
    maxFilesPerDay: normalizePositiveInteger(
      logging.maxFilesPerDay,
      DEFAULT_MEMORY_LOGGING_SETTINGS.maxFilesPerDay,
    ),
    retentionDays: normalizePositiveInteger(
      logging.retentionDays,
      DEFAULT_MEMORY_LOGGING_SETTINGS.retentionDays,
    ),
    maxPayloadChars: normalizePositiveInteger(
      logging.maxPayloadChars,
      DEFAULT_MEMORY_LOGGING_SETTINGS.maxPayloadChars,
    ),
  };
  lastReadAt = now;
  lastSettingsPath = settingsPath;
  return cachedSettings;
}
