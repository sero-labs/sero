import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  configureElectronFetch: vi.fn(),
  updateSubagentSettings: vi.fn(),
}));

vi.mock('@electron/shared/infra/electron-fetch', () => ({
  configureElectronFetch: mocks.configureElectronFetch,
}));

vi.mock('@electron/shared/infra/singletons', () => ({
  subagentManager: { updateSettings: mocks.updateSubagentSettings },
}));

import { applyRuntimeSettings } from '@electron/shared/infra/runtime-settings';

describe('runtime settings', () => {
  beforeEach(() => {
    mocks.configureElectronFetch.mockReset();
    mocks.updateSubagentSettings.mockReset();
  });

  it('applies the HTTP idle timeout with other live settings', () => {
    const settingsManager = {
      getHttpIdleTimeoutMs: () => 900000,
      getGlobalSettings: () => ({ subagent: { maxConcurrent: 4 } }),
    };

    applyRuntimeSettings(settingsManager as never);

    expect(mocks.configureElectronFetch).toHaveBeenCalledWith(900000);
    expect(mocks.updateSubagentSettings).toHaveBeenCalledWith(expect.objectContaining({
      maxConcurrent: 4,
    }));
  });
});
