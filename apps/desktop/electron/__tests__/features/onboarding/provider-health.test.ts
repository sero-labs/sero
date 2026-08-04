import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Provider } from '@earendil-works/pi-ai';
import type { RegistryModelLike } from '@electron/features/onboarding/model-groups';

const mocks = vi.hoisted(() => ({
  ensureInfra: vi.fn(),
}));

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: '/tmp/sero-provider-health-test',
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  ensureInfra: mocks.ensureInfra,
}));

vi.mock('@electron/shared/providers/package-provider-manifests', () => ({
  getPackageApiKeyProviders: () => [],
  getPackageProviderManifest: () => undefined,
}));

import { getProviderHealthSnapshot } from '@electron/features/onboarding/provider-health';

function apiKeyProvider(id: string): Provider {
  return {
    id,
    name: id,
    auth: { apiKey: { name: `${id} key`, login: vi.fn(), resolve: vi.fn() } },
    getModels: () => [],
  } as unknown as Provider;
}

describe('provider health', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('labels command-configured API keys as environment credentials', async () => {
    vi.stubEnv('COMMAND_PROVIDER_KEY', 'environment-secret');
    const provider = apiKeyProvider('openai');
    const availableModel: RegistryModelLike = {
      provider: 'openai',
      id: 'gpt-test',
      name: 'GPT Test',
      reasoning: false,
    };
    mocks.ensureInfra.mockResolvedValue({
      modelRuntime: {
        getAvailableSnapshot: () => [availableModel],
        getProviders: () => [provider],
        listCredentials: vi.fn(async () => []),
        getProviderAuthStatus: vi.fn(() => ({
          configured: true,
          source: 'models_json_command' as const,
          label: '!printenv COMMAND_PROVIDER_KEY',
        })),
      },
    });

    const snapshot = await getProviderHealthSnapshot();

    expect(snapshot.providerHealth).toContainEqual(expect.objectContaining({
      providerId: 'openai',
      status: 'env',
      usableModelIds: ['gpt-test'],
    }));
  });
});
