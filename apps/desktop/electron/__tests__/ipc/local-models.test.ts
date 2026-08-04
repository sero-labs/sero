import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const AGENT_DIR = '/tmp/sero-local-models-test-agent';
const MODELS_PATH = `${AGENT_DIR}/models.json`;
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  ensureInfra: vi.fn(),
  refreshModelAvailability: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    },
  },
}));

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: '/tmp/sero-local-models-test-agent',
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  ensureInfra: mocks.ensureInfra,
}));

vi.mock('@electron/ipc/agent/core/model-availability-refresh', () => ({
  refreshModelAvailability: mocks.refreshModelAvailability,
}));

import { IpcChannels } from '@/types/ipc-channels';
import { registerLocalModelsHandlers } from '@electron/ipc/agent/handlers/local-models';

describe('local models IPC', () => {
  beforeAll(() => {
    mkdirSync(AGENT_DIR, { recursive: true });
    registerLocalModelsHandlers();
  });

  afterAll(() => rmSync(AGENT_DIR, { recursive: true, force: true }));

  it('reads models.json without unrelated runtime errors blocking the editor', async () => {
    const config = { providers: { local: { baseUrl: 'http://localhost:11434' } } };
    writeFileSync(MODELS_PATH, JSON.stringify(config));
    mocks.ensureInfra.mockRejectedValue(new Error('Availability refresh: unrelated failure'));
    const getConfig = mocks.handlers.get(IpcChannels.localModels.getConfig);
    if (!getConfig) throw new Error('Local models getConfig handler was not registered');

    await expect(getConfig()).resolves.toEqual(config);
    expect(mocks.ensureInfra).not.toHaveBeenCalled();
  });

  it('returns registry validation errors as non-blocking save warnings', async () => {
    mocks.refreshModelAvailability.mockResolvedValue({
      registryError: 'Provider "local": invalid configuration',
    });
    const saveConfig = mocks.handlers.get(IpcChannels.localModels.saveConfig);
    if (!saveConfig) throw new Error('Local models saveConfig handler was not registered');

    await expect(saveConfig({}, { providers: {} })).resolves.toEqual({
      warning: 'Provider "local": invalid configuration',
    });
  });

  it('succeeds when the runtime only reports an availability error', async () => {
    mocks.refreshModelAvailability.mockResolvedValue({
      registryError: 'Availability refresh: network unavailable',
    });
    const saveConfig = mocks.handlers.get(IpcChannels.localModels.saveConfig);
    if (!saveConfig) throw new Error('Local models saveConfig handler was not registered');

    await expect(saveConfig({}, { providers: {} })).resolves.toEqual({
      warning: 'Availability refresh: network unavailable',
    });
  });
});
