import { getOAuthProviders } from '@earendil-works/pi-ai/oauth';
import { getPackageApiKeyProviders, getPackageProviderEnvVar } from '../providers/package-provider-manifests';

export interface NamedProvider {
  id: string;
  name: string;
}

// Mirrors Pi API-key auth.json keys from docs/providers.md and
// env-api-keys.ts. Sero still stores credentials in ~/.sero-ui/agent/auth.json.
const BUILTIN_API_KEY_PROVIDERS: NamedProvider[] = [
  { id: 'anthropic', name: 'Anthropic' }, // ANTHROPIC_OAUTH_TOKEN or ANTHROPIC_API_KEY
  { id: 'openai', name: 'OpenAI' }, // OPENAI_API_KEY
  { id: 'google', name: 'Google (Gemini)' }, // GEMINI_API_KEY
  { id: 'openrouter', name: 'OpenRouter' }, // OPENROUTER_API_KEY
  { id: 'xai', name: 'xAI' }, // XAI_API_KEY
  { id: 'groq', name: 'Groq' }, // GROQ_API_KEY
  { id: 'cerebras', name: 'Cerebras' }, // CEREBRAS_API_KEY
  { id: 'mistral', name: 'Mistral' }, // MISTRAL_API_KEY
  { id: 'deepseek', name: 'DeepSeek' }, // DEEPSEEK_API_KEY
  { id: 'azure-openai-responses', name: 'Azure OpenAI' }, // AZURE_OPENAI_API_KEY
  { id: 'huggingface', name: 'Hugging Face' }, // HF_TOKEN
  { id: 'vercel-ai-gateway', name: 'Vercel AI Gateway' }, // AI_GATEWAY_API_KEY
  // cloudflare-workers-ai/cloudflare-ai-gateway require additional account/gateway IDs;
  // hide them until Sero supports provider-specific multi-field setup.
  { id: 'zai', name: 'ZAI' }, // ZAI_API_KEY
  { id: 'opencode', name: 'OpenCode' }, // OPENCODE_API_KEY
  { id: 'opencode-go', name: 'OpenCode Go' }, // OPENCODE_API_KEY
  { id: 'kimi-coding', name: 'Kimi' }, // KIMI_API_KEY
  { id: 'minimax', name: 'MiniMax' }, // MINIMAX_API_KEY
  { id: 'minimax-cn', name: 'MiniMax CN' }, // MINIMAX_CN_API_KEY
  { id: 'moonshotai', name: 'Moonshot AI' }, // MOONSHOT_API_KEY
  { id: 'moonshotai-cn', name: 'Moonshot AI (China)' }, // MOONSHOT_API_KEY
  { id: 'fireworks', name: 'Fireworks' }, // FIREWORKS_API_KEY
  { id: 'xiaomi', name: 'Xiaomi MiMo' }, // XIAOMI_API_KEY
  { id: 'xiaomi-token-plan-cn', name: 'Xiaomi MiMo Token Plan CN' }, // XIAOMI_TOKEN_PLAN_CN_API_KEY
  { id: 'xiaomi-token-plan-ams', name: 'Xiaomi MiMo Token Plan AMS' }, // XIAOMI_TOKEN_PLAN_AMS_API_KEY
  { id: 'xiaomi-token-plan-sgp', name: 'Xiaomi MiMo Token Plan SGP' }, // XIAOMI_TOKEN_PLAN_SGP_API_KEY
  // google-gemini-cli and google-antigravity were removed from Pi built-ins in 0.71.
];

const BUILTIN_PROVIDER_ENV_VARS: Record<string, readonly string[]> = {
  anthropic: ['ANTHROPIC_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  google: ['GEMINI_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  xai: ['XAI_API_KEY'],
  groq: ['GROQ_API_KEY'],
  cerebras: ['CEREBRAS_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  'azure-openai-responses': ['AZURE_OPENAI_API_KEY'],
  huggingface: ['HF_TOKEN'],
  'vercel-ai-gateway': ['AI_GATEWAY_API_KEY'],
  zai: ['ZAI_API_KEY'],
  opencode: ['OPENCODE_API_KEY'],
  'opencode-go': ['OPENCODE_API_KEY'],
  'kimi-coding': ['KIMI_API_KEY'],
  minimax: ['MINIMAX_API_KEY'],
  'minimax-cn': ['MINIMAX_CN_API_KEY'],
  moonshotai: ['MOONSHOT_API_KEY'],
  'moonshotai-cn': ['MOONSHOT_API_KEY'],
  fireworks: ['FIREWORKS_API_KEY'],
  xiaomi: ['XIAOMI_API_KEY'],
  'xiaomi-token-plan-cn': ['XIAOMI_TOKEN_PLAN_CN_API_KEY'],
  'xiaomi-token-plan-ams': ['XIAOMI_TOKEN_PLAN_AMS_API_KEY'],
  'xiaomi-token-plan-sgp': ['XIAOMI_TOKEN_PLAN_SGP_API_KEY'],
};

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
  for (const envVar of BUILTIN_PROVIDER_ENV_VARS[providerId] ?? []) {
    const value = process.env[envVar];
    if (value) return value;
  }

  const envVar = getPackageProviderEnvVar(providerId);
  return envVar ? process.env[envVar] : undefined;
}

export function getOAuthProviderCatalog(): NamedProvider[] {
  return getOAuthProviders().map((provider) => ({
    id: provider.id,
    name: provider.name,
  }));
}
