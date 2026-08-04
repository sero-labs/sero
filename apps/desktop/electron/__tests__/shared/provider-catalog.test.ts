import { describe, expect, it, vi } from 'vitest';
import type { Provider } from '@earendil-works/pi-ai';

vi.mock('@electron/shared/providers/package-provider-manifests', () => ({
  getPackageApiKeyProviders: () => [],
}));

import {
  getApiKeyProviderCatalog,
  getOAuthProviderCatalog,
} from '@electron/shared/auth/provider-catalog';

const removedProviderIds = ['google-gemini-cli', 'google-antigravity'];

function apiKeyProvider(id: string): Provider {
  return {
    id,
    name: id,
    auth: { apiKey: { name: `${id} key`, login: vi.fn(), resolve: vi.fn() } },
    getModels: () => [],
  } as unknown as Provider;
}

function oauthProvider(id: string): Provider {
  return {
    id,
    name: id,
    auth: {
      oauth: {
        name: `${id} login`,
        login: vi.fn(),
        refresh: vi.fn(),
        toAuth: vi.fn(),
      },
    },
    getModels: () => [],
  } as unknown as Provider;
}

describe('provider catalog', () => {
  it('lists Pi API-key providers exposed by Sero auth', () => {
    const providers = [
      'deepseek',
      'moonshotai',
      'moonshotai-cn',
      'xiaomi',
      'xiaomi-token-plan-cn',
      'xiaomi-token-plan-ams',
      'xiaomi-token-plan-sgp',
    ].map(apiKeyProvider);
    const ids = getApiKeyProviderCatalog(providers).map((provider) => provider.id);

    expect(ids).toEqual(expect.arrayContaining([
      'deepseek',
      'moonshotai',
      'moonshotai-cn',
      'xiaomi',
      'xiaomi-token-plan-cn',
      'xiaomi-token-plan-ams',
      'xiaomi-token-plan-sgp',
    ]));
    expect(ids).not.toContain('cloudflare-workers-ai');
    expect(ids).not.toContain('cloudflare-ai-gateway');
    for (const removedProviderId of removedProviderIds) {
      expect(ids).not.toContain(removedProviderId);
    }
  });

  it('excludes runtime providers that need unsupported setup fields', () => {
    const providers = [
      apiKeyProvider('anthropic'),
      apiKeyProvider('amazon-bedrock'),
      apiKeyProvider('cloudflare-workers-ai'),
      apiKeyProvider('github-copilot'),
      apiKeyProvider('google-vertex'),
    ];

    expect(getApiKeyProviderCatalog(providers)).toEqual([
      { id: 'anthropic', name: 'Anthropic' },
    ]);
  });

  it('resolves OAuth providers from runtime metadata', () => {
    const providers = [
      oauthProvider('anthropic'),
      oauthProvider('github-copilot'),
      oauthProvider('openai-codex'),
    ];
    const oauthIds = getOAuthProviderCatalog(providers).map((provider) => provider.id);

    expect(oauthIds).toEqual(expect.arrayContaining([
      'anthropic',
      'github-copilot',
      'openai-codex',
    ]));
    for (const removedProviderId of removedProviderIds) {
      expect(oauthIds).not.toContain(removedProviderId);
    }
  });
});
