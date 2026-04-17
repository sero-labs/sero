import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvailableModelGroup, ProviderHealthInfo } from '@/types/ipc';

const mocks = vi.hoisted(() => ({
  profileGetActive: vi.fn(),
  getProviderHealthSnapshot: vi.fn(),
  readSettingsResult: vi.fn(),
  writeSettings: vi.fn(),
  applyLegacyProviderDefaultsMigration: vi.fn(),
  cleanupUnavailableModelSelections: vi.fn(),
  getGlobalModelConfigTiers: vi.fn(),
  buildOnboardingRecommendation: vi.fn(),
  validateCurrentTiers: vi.fn(),
  access: vi.fn(),
  readFile: vi.fn(),
  getContainerAvailability: vi.fn(),
}));

vi.mock('@electron/features/profile/manager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@electron/features/profile/manager')>();
  return {
    ...actual,
    profileManager: {
      ...actual.profileManager,
      getActive: mocks.profileGetActive,
    },
  };
});

vi.mock('@electron/features/onboarding/provider-health', () => ({
  getProviderHealthSnapshot: mocks.getProviderHealthSnapshot,
}));

vi.mock('@electron/features/container/core/availability', () => ({
  getContainerAvailability: mocks.getContainerAvailability,
}));

vi.mock('@electron/shared/settings/settings-helpers', () => ({
  readSettingsResult: mocks.readSettingsResult,
  writeSettings: mocks.writeSettings,
}));

vi.mock('@electron/shared/settings/model-config', () => ({
  applyLegacyProviderDefaultsMigration: mocks.applyLegacyProviderDefaultsMigration,
  getGlobalModelConfigTiers: mocks.getGlobalModelConfigTiers,
}));

vi.mock('@electron/shared/settings/cleanup-unavailable-model-selections', () => ({
  cleanupUnavailableModelSelections: mocks.cleanupUnavailableModelSelections,
}));

vi.mock('@electron/features/onboarding/recommendations', () => ({
  buildOnboardingRecommendation: mocks.buildOnboardingRecommendation,
  validateCurrentTiers: mocks.validateCurrentTiers,
}));

vi.mock('fs/promises', () => ({
  access: mocks.access,
  readFile: mocks.readFile,
}));

import {
  getOnboardingState,
  getOnboardingStateWithRepairs,
} from '@electron/features/onboarding/preflight';

const availableModelGroups: AvailableModelGroup[] = [
  {
    provider: 'openai',
    displayName: 'OpenAI',
    logo: 'https://models.dev/logos/openai.svg',
    models: [
      {
        provider: 'openai',
        modelId: 'gpt-5.4',
        name: 'GPT-5.4',
        reasoning: true,
      },
    ],
  },
];

const providerHealth: ProviderHealthInfo[] = [
  {
    providerId: 'openai',
    displayName: 'OpenAI',
    status: 'healthy',
    message: 'Ready to use.',
    canReconnect: false,
    hasUsableModels: true,
    usableModelIds: ['gpt-5.4'],
  },
];

describe('onboarding preflight', () => {
  beforeEach(() => {
    mocks.profileGetActive.mockReset().mockReturnValue({
      id: 'profile-1',
      name: 'Default',
      path: '/tmp/profile-1',
      createdAt: new Date().toISOString(),
      onboarded: false,
    });
    mocks.getProviderHealthSnapshot.mockReset().mockResolvedValue({
      availableModelGroups,
      providerHealth,
    });
    mocks.readSettingsResult.mockReset().mockReturnValue({ ok: true, settings: {} });
    mocks.writeSettings.mockReset();
    mocks.applyLegacyProviderDefaultsMigration.mockReset().mockReturnValue({
      settings: {},
      changed: false,
    });
    mocks.cleanupUnavailableModelSelections.mockReset().mockReturnValue(false);
    mocks.getGlobalModelConfigTiers.mockReset().mockReturnValue({});
    mocks.buildOnboardingRecommendation.mockReset().mockReturnValue({
      recommendation: null,
      invalidTiers: [],
    });
    mocks.validateCurrentTiers.mockReset().mockReturnValue({
      validTiers: {},
      invalidTiers: [],
    });
    mocks.access.mockReset().mockResolvedValue(undefined);
    mocks.readFile.mockReset().mockResolvedValue('{}');
    mocks.getContainerAvailability.mockReset().mockResolvedValue({
      status: 'available',
      message: 'Apple containers are available.',
      recommended: true,
    });
  });

  it('keeps getOnboardingState read-only for non-onboarded profiles', async () => {
    const state = await getOnboardingState();

    expect(mocks.applyLegacyProviderDefaultsMigration).not.toHaveBeenCalled();
    expect(mocks.cleanupUnavailableModelSelections).not.toHaveBeenCalled();
    expect(mocks.writeSettings).not.toHaveBeenCalled();
    expect(state.needed).toBe(true);
    expect(state.phase).toBe('ready');
    expect(state.availableModelGroups).toEqual(availableModelGroups);
    expect(state.containerRuntime).toEqual({
      status: 'available',
      message: 'Apple containers are available.',
      recommended: true,
      docsUrl: undefined,
    });
  });

  it('runs migration and unavailable-tier cleanup only in getOnboardingStateWithRepairs', async () => {
    const migratedSettings = { sero: { defaultProvider: 'openai' } };
    const cleanedSettings = { sero: { modelTiers: { LOW: { provider: 'openai', modelId: 'gpt-5.4' } } } };

    mocks.readSettingsResult
      .mockReset()
      .mockReturnValueOnce({ ok: true, settings: {} })
      .mockReturnValueOnce({ ok: true, settings: cleanedSettings });
    mocks.applyLegacyProviderDefaultsMigration.mockReset().mockReturnValue({
      settings: migratedSettings,
      changed: true,
    });
    mocks.cleanupUnavailableModelSelections.mockReset().mockReturnValue(true);

    await getOnboardingStateWithRepairs();

    expect(mocks.applyLegacyProviderDefaultsMigration).toHaveBeenCalledWith({});
    expect(mocks.writeSettings).toHaveBeenCalledWith(migratedSettings);
    expect(mocks.cleanupUnavailableModelSelections).toHaveBeenCalledWith([
      { provider: 'openai', modelId: 'gpt-5.4' },
    ]);
    expect(mocks.readSettingsResult).toHaveBeenCalledTimes(2);
  });

  it('adds a docs-linked runtime warning when the container binary is missing', async () => {
    mocks.getContainerAvailability.mockResolvedValue({
      status: 'missing_binary',
      message: 'Install Apple containers.',
      recommended: true,
    });

    const state = await getOnboardingState();

    expect(state.containerRuntime).toEqual({
      status: 'missing_binary',
      message: 'Install Apple containers.',
      recommended: true,
      docsUrl: 'https://github.com/monobyte/sero/blob/main/docs/guides/macos-containers.md',
    });
  });

  it('adds a docs-linked runtime warning when the container system is unavailable', async () => {
    mocks.getContainerAvailability.mockResolvedValue({
      status: 'system_unavailable',
      message: 'Container system is not running.',
      recommended: true,
    });

    const state = await getOnboardingState();

    expect(state.containerRuntime).toEqual({
      status: 'system_unavailable',
      message: 'Container system is not running.',
      recommended: true,
      docsUrl: 'https://github.com/monobyte/sero/blob/main/docs/guides/macos-containers.md',
    });
  });

  it('surfaces malformed settings errors without rewriting the file', async () => {
    mocks.readSettingsResult.mockReset().mockReturnValue({
      ok: false,
      error: new Error('Failed to read /tmp/profile-1/agent/settings.json. Fix the file and retry. (Unexpected token)'),
    });

    await expect(getOnboardingState()).rejects.toThrow('Fix the file and retry');

    expect(mocks.applyLegacyProviderDefaultsMigration).not.toHaveBeenCalled();
    expect(mocks.cleanupUnavailableModelSelections).not.toHaveBeenCalled();
    expect(mocks.writeSettings).not.toHaveBeenCalled();
  });
});
