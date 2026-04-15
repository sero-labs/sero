import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readPluginConfig: vi.fn(),
}));

vi.mock('@electron/features/plugin-config', () => ({
  readPluginConfig: mocks.readPluginConfig,
}));

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: '/profiles/work/agent',
}));

import {
  getGoogleOAuthNotConfiguredMessage,
  getGooglePluginConfigPath,
} from '@electron/features/auth/google/config';

describe('google auth config guidance', () => {
  it('builds profile-scoped plugin config paths from SERO_AGENT_DIR', () => {
    expect(getGooglePluginConfigPath()).toBe('/profiles/work/agent/plugin-config/sero-google-plugin.json');
  });

  it('surfaces profile-scoped setup guidance for missing OAuth credentials', () => {
    expect(getGoogleOAuthNotConfiguredMessage()).toBe(
      'Google OAuth not configured. Use the setup form in the Google plugin or add credentials to /profiles/work/agent/plugin-config/sero-google-plugin.json',
    );
  });
});
