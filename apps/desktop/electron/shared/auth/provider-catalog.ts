import type { Provider } from '@earendil-works/pi-ai';
import { getPackageApiKeyProviders } from '../providers/package-provider-manifests';

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

export function getApiKeyProviderCatalog(providers: readonly Provider[]): NamedProvider[] {
  const runtimeProviderIds = new Set(providers.map((provider) => provider.id));
  const byId = new Map<string, NamedProvider>();
  for (const provider of BUILTIN_API_KEY_PROVIDERS) {
    if (runtimeProviderIds.has(provider.id)) byId.set(provider.id, provider);
  }
  for (const provider of getPackageApiKeyProviders()) byId.set(provider.id, provider);
  return [...byId.values()];
}

export function getOAuthProviderCatalog(providers: readonly Provider[]): NamedProvider[] {
  const catalog: NamedProvider[] = [];
  for (const provider of providers) {
    if (provider.auth.oauth) catalog.push({ id: provider.id, name: provider.name });
  }
  return catalog;
}
