import { describe, expect, it } from 'vitest';
import {
  getSavedCredentialProviders,
  sortProvidersByPreference,
} from './provider-list-helpers';

describe('sortProvidersByPreference', () => {
  it('keeps the preferred provider first and sorts the rest alphabetically', () => {
    const providers = [
      { id: 'openai', name: 'OpenAI' },
      { id: 'anthropic', name: 'Anthropic' },
      { id: 'google', name: 'Google' },
    ];

    expect(sortProvidersByPreference(providers, 'google').map((provider) => provider.id)).toEqual([
      'google',
      'anthropic',
      'openai',
    ]);
  });
});

describe('getSavedCredentialProviders', () => {
  it('includes logged-in OAuth and manually saved API-key providers only', () => {
    expect(
      getSavedCredentialProviders(
        [
          { id: 'github', name: 'GitHub', isLoggedIn: true },
          { id: 'google', name: 'Google', isLoggedIn: false },
        ],
        [
          { id: 'openai', name: 'OpenAI', hasKey: true, fromEnv: false },
          { id: 'anthropic', name: 'Anthropic', hasKey: true, fromEnv: true },
          { id: 'groq', name: 'Groq', hasKey: false, fromEnv: false },
        ],
      ),
    ).toEqual([
      { id: 'github', name: 'GitHub', isLoggedIn: true, kind: 'oauth' },
      { id: 'openai', name: 'OpenAI', hasKey: true, fromEnv: false, kind: 'apiKey' },
    ]);
  });
});
