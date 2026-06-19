import type { GraphifyBackend } from '../shared/types';

export interface ProviderKey {
  envVar: string;
  key: string;
}

export type GetProviderApiKey = (providerId: string) => Promise<ProviderKey | null>;

export const BACKEND_PROVIDERS: Record<GraphifyBackend, { providerId: string | null; displayName: string }> = {
  claude: { providerId: 'anthropic', displayName: 'Anthropic' },
  openai: { providerId: 'openai', displayName: 'OpenAI' },
  gemini: { providerId: 'google', displayName: 'Google (Gemini)' },
  deepseek: { providerId: 'deepseek', displayName: 'DeepSeek' },
  kimi: { providerId: 'moonshotai', displayName: 'Moonshot (Kimi)' },
  ollama: { providerId: null, displayName: 'Ollama (local)' },
};

/** Build the child-process env for graphify extraction. Throws when the backend needs a key the user hasn't configured. */
export async function extractionEnv(
  backend: GraphifyBackend,
  getProviderApiKey: GetProviderApiKey,
  baseEnv: NodeJS.ProcessEnv = process.env,
): Promise<NodeJS.ProcessEnv> {
  const mapping = BACKEND_PROVIDERS[backend];
  const env = { ...baseEnv };
  if (mapping.providerId) {
    const provider = await getProviderApiKey(mapping.providerId);
    if (!provider) {
      throw new Error(`No API key configured for ${mapping.displayName}. Add one in Sero settings or choose another backend.`);
    }
    env[provider.envVar] = provider.key;
  }
  return env;
}
