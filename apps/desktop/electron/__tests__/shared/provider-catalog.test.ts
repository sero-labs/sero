import { describe, expect, it, vi } from 'vitest';

vi.mock('@electron/shared/providers/package-provider-manifests', () => ({
  getPackageApiKeyProviders: () => [],
  getPackageProviderEnvVar: () => undefined,
}));

import {
  getApiKeyProviderCatalog,
  getOAuthProviderCatalog,
} from '@electron/shared/auth/provider-catalog';

const removedProviderIds = ['google-gemini-cli', 'google-antigravity'];

describe('provider catalog', () => {
  it('lists Pi API-key providers exposed by Sero auth', () => {
    const ids = getApiKeyProviderCatalog().map((provider) => provider.id);

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

  it('resolves Pi OAuth providers from the subpath export', () => {
    const oauthIds = getOAuthProviderCatalog().map((provider) => provider.id);

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
