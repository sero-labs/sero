import type { ApiKeyProviderInfo, OAuthProviderInfo } from '@/types/ipc';

export interface SavedCredentialProvider {
  id: string;
  name: string;
  kind: 'oauth' | 'apiKey';
}

export function sortProvidersByPreference<T extends { id: string; name: string }>(
  providers: T[],
  preferredProviderId?: string | null,
): T[] {
  return [...providers].sort((a, b) => {
    const aPreferred = preferredProviderId && a.id === preferredProviderId ? 1 : 0;
    const bPreferred = preferredProviderId && b.id === preferredProviderId ? 1 : 0;
    if (aPreferred !== bPreferred) return bPreferred - aPreferred;
    return a.name.localeCompare(b.name);
  });
}

export function getSavedCredentialProviders(
  oauthProviders: OAuthProviderInfo[],
  apiKeyProviders: ApiKeyProviderInfo[],
): SavedCredentialProvider[] {
  return [
    ...oauthProviders
      .filter((provider) => provider.isLoggedIn)
      .map((provider) => ({ ...provider, kind: 'oauth' as const })),
    ...apiKeyProviders
      .filter((provider) => provider.hasKey && !provider.fromEnv)
      .map((provider) => ({ ...provider, kind: 'apiKey' as const })),
  ];
}
