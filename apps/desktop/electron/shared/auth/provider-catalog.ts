import { getOAuthProviders } from '@mariozechner/pi-ai/oauth';

export interface NamedProvider {
  id: string;
  name: string;
}

/** Providers that accept a plain API key (not OAuth). */
export const API_KEY_PROVIDERS: NamedProvider[] = [
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
  { id: 'alibaba-cloud', name: 'Alibaba Cloud' },
];

export function getOAuthProviderCatalog(): NamedProvider[] {
  return getOAuthProviders().map((provider) => ({
    id: provider.id,
    name: provider.name,
  }));
}
