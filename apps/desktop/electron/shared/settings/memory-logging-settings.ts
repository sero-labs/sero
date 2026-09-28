import { getSeroSettings } from './settings-helpers';

const DEFAULT_MEMORY_LOGGING_SETTINGS = {
  maxBytesPerFile: 2 * 1024 * 1024,
  maxFilesPerDay: 3,
  retentionDays: 14,
  maxPayloadChars: 4_096,
};

function getObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function getDefaultMemoryLoggingSettings(): Record<string, number> {
  return { ...DEFAULT_MEMORY_LOGGING_SETTINGS };
}

export function ensureConfiguredMemoryLoggingSettings(settings: Record<string, unknown>): {
  settings: Record<string, unknown>;
  changed: boolean;
} {
  const sero = getSeroSettings(settings);
  const memory = getObject(sero.memory);
  const logging = getObject(memory.logging);

  const nextLogging = {
    ...DEFAULT_MEMORY_LOGGING_SETTINGS,
    ...logging,
  };

  const nextSettings = {
    ...settings,
    sero: {
      ...sero,
      memory: {
        ...memory,
        logging: nextLogging,
      },
    },
  };

  const changed = JSON.stringify(logging) !== JSON.stringify(nextLogging);
  return { settings: nextSettings, changed };
}
