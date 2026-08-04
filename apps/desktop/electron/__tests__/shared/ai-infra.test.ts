import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const createRuntime = vi.fn();
  const createSettings = vi.fn();
  const pickFirstAvailableModel = vi.fn();
  const registerPackageProviderAuth = vi.fn();
  const ModelRegistry = vi.fn(function ModelRegistry(runtime: unknown) {
    return { runtime };
  });
  return {
    createRuntime,
    createSettings,
    pickFirstAvailableModel,
    registerPackageProviderAuth,
    ModelRegistry,
  };
});

vi.mock('@earendil-works/pi-coding-agent', () => ({
  ModelRuntime: { create: mocks.createRuntime },
  ModelRegistry: mocks.ModelRegistry,
  SettingsManager: { create: mocks.createSettings },
}));

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: '/profiles/current/agent',
}));

vi.mock('@electron/shared/infra/model-selection', () => ({
  pickFirstAvailableModel: mocks.pickFirstAvailableModel,
}));

vi.mock('@electron/shared/providers/package-provider-manifests', () => ({
  registerPackageProviderAuth: mocks.registerPackageProviderAuth,
}));

async function loadInfra() {
  return import('@electron/shared/infra/ai-infra');
}

describe('AI infrastructure', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createRuntime.mockReset();
    mocks.createSettings.mockReset();
    mocks.pickFirstAvailableModel.mockReset();
    mocks.registerPackageProviderAuth.mockReset();
    mocks.ModelRegistry.mockClear();
  });

  it('shares one asynchronous model runtime across concurrent callers', async () => {
    const runtime = { id: 'shared-runtime' };
    const settingsManager = {
      getDefaultThinkingLevel: vi.fn(() => undefined),
      setDefaultThinkingLevel: vi.fn(),
    };
    const selectedModel = { provider: 'test', id: 'model' };
    mocks.createRuntime.mockResolvedValue(runtime);
    mocks.createSettings.mockReturnValue(settingsManager);
    mocks.pickFirstAvailableModel.mockReturnValue(selectedModel);
    const { ensureAiInfra } = await loadInfra();

    const [first, second] = await Promise.all([ensureAiInfra(), ensureAiInfra()]);

    expect(first).toBe(second);
    expect(first.modelRuntime).toBe(runtime);
    expect(first.modelRegistry).toEqual({ runtime });
    expect(first.model).toBe(selectedModel);
    expect(mocks.createRuntime).toHaveBeenCalledOnce();
    expect(mocks.createRuntime).toHaveBeenCalledWith({
      authPath: '/profiles/current/agent/auth.json',
      modelsPath: '/profiles/current/agent/models.json',
      allowModelNetwork: false,
    });
    expect(mocks.registerPackageProviderAuth).toHaveBeenCalledWith(runtime);
    expect(settingsManager.setDefaultThinkingLevel).toHaveBeenCalledWith('high');
  });

  it('retries after initialization fails', async () => {
    const runtime = { id: 'retry-runtime' };
    const settingsManager = {
      getDefaultThinkingLevel: vi.fn(() => 'medium'),
      setDefaultThinkingLevel: vi.fn(),
    };
    mocks.createRuntime
      .mockRejectedValueOnce(new Error('initial failure'))
      .mockResolvedValueOnce(runtime);
    mocks.createSettings.mockReturnValue(settingsManager);
    const { ensureAiInfra } = await loadInfra();

    await expect(ensureAiInfra()).rejects.toThrow('initial failure');
    await expect(ensureAiInfra()).resolves.toMatchObject({ modelRuntime: runtime });

    expect(mocks.createRuntime).toHaveBeenCalledTimes(2);
    expect(settingsManager.setDefaultThinkingLevel).not.toHaveBeenCalled();
  });
});
