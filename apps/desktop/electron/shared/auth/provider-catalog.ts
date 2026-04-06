import { getEnvApiKey } from '@mariozechner/pi-ai';
import { getOAuthProviders } from '@mariozechner/pi-ai/oauth';
import { getPackageApiKeyProviders, getPackageProviderEnvVar } from '../providers/package-provider-manifests';

export interface NamedProvider {
  id: string;
  name: string;
}

const BUILTIN_API_KEY_PROVIDERS: NamedProvider[] = [
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'google', name: 'Google (Gemini)' },
  { id: 'openrouter', name: 'OpenRouter' },
  { id: 'xai', name: 'xAI' },
  { id: 'groq', name: 'Groq' },
  { id: 'cerebras', name: 'Cerebras' },
  { id: 'mistral', name: 'Mistral' },
  { id: 'azure-openai-responses', name: 'Azure OpenAI' },
  { id: 'huggingface', name: 'Hugging Face' },
  { id: 'vercel-ai-gateway', name: 'Vercel AI Gateway' },
  { id: 'zai', name: 'ZAI' },
  { id: 'opencode', name: 'OpenCode' },
  { id: 'kimi-coding', name: 'Kimi' },
];

export function getApiKeyProviderCatalog(): NamedProvider[] {
  const byId = new Map<string, NamedProvider>();
  for (const provider of BUILTIN_API_KEY_PROVIDERS) {
    byId.set(provider.id, provider);
  }
  for (const provider of getPackageApiKeyProviders()) {
    byId.set(provider.id, provider);
  }
  return [...byId.values()];
}

export function getProviderEnvApiKey(providerId: string): string | undefined {
  const defaultEnvKey = getEnvApiKey(providerId);
  if (defaultEnvKey) return defaultEnvKey;

  const envVar = getPackageProviderEnvVar(providerId);
  return envVar ? process.env[envVar] : undefined;
}

export function getOAuthProviderCatalog(): NamedProvider[] {
  return getOAuthProviders().map((provider) => ({
    id: provider.id,
    name: provider.name,
  }));
}
