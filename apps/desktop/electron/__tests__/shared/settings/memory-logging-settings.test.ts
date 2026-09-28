import { describe, expect, it } from 'vitest';

import {
  ensureConfiguredMemoryLoggingSettings,
  getDefaultMemoryLoggingSettings,
} from '@electron/shared/settings/memory-logging-settings';

describe('memory logging settings', () => {
  it('returns the default memory logging policy', () => {
    expect(getDefaultMemoryLoggingSettings()).toEqual({
      maxBytesPerFile: 2 * 1024 * 1024,
      maxFilesPerDay: 3,
      retentionDays: 14,
      maxPayloadChars: 4_096,
    });
  });

  it('seeds missing settings.json memory logging defaults', () => {
    const result = ensureConfiguredMemoryLoggingSettings({ sero: {} });

    expect(result.changed).toBe(true);
    expect(result.settings).toEqual({
      sero: {
        memory: {
          logging: getDefaultMemoryLoggingSettings(),
        },
      },
    });
  });

  it('preserves explicit user overrides while filling missing keys', () => {
    const result = ensureConfiguredMemoryLoggingSettings({
      sero: {
        memory: {
          logging: {
            retentionDays: 30,
          },
        },
      },
    });

    expect(result.changed).toBe(true);
    expect(result.settings).toEqual({
      sero: {
        memory: {
          logging: {
            ...getDefaultMemoryLoggingSettings(),
            retentionDays: 30,
          },
        },
      },
    });
  });
});
