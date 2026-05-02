import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: '/tmp/sero-agent',
}));

vi.mock('fs', () => ({
  readFileSync: mocks.readFileSync,
  writeFileSync: mocks.writeFileSync,
}));

import {
  getSettingsPath,
  readSettings,
  readSettingsResult,
  writeSettings,
} from '@electron/shared/settings/settings-helpers';

describe('settings helpers', () => {
  beforeEach(() => {
    mocks.readFileSync.mockReset();
    mocks.writeFileSync.mockReset();
  });

  it('returns an empty object when settings.json does not exist yet', () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });
    mocks.readFileSync.mockImplementation(() => {
      throw missing;
    });

    expect(readSettingsResult()).toEqual({ ok: true, settings: {} });
  });

  it('throws a descriptive error for malformed settings files', () => {
    mocks.readFileSync.mockReturnValue('{not-json');

    expect(() => readSettings()).toThrow(
      'Failed to read /tmp/sero-agent/settings.json. Fix the file and retry.',
    );
  });

  it('persists to the active profile settings path', () => {
    writeSettings({ sero: { theme: 'dark' } });

    expect(getSettingsPath()).toBe('/tmp/sero-agent/settings.json');
    expect(mocks.writeFileSync).toHaveBeenCalledWith(
      '/tmp/sero-agent/settings.json',
      '{\n  "sero": {\n    "theme": "dark"\n  }\n}\n',
      'utf8',
    );
  });
});
