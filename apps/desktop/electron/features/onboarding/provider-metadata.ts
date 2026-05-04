import { getPackageProviderManifest } from '@electron/shared/providers/package-provider-manifests';

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  'openai-codex': 'OpenAI (Codex)',
  google: 'Google',
  'google-vertex': 'Google Vertex',
  xai: 'xAI',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  cerebras: 'Cerebras',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
  'github-copilot': 'GitHub Copilot',
  'amazon-bedrock': 'Amazon Bedrock',
  'azure-openai-responses': 'Azure OpenAI',
  huggingface: 'Hugging Face',
  'vercel-ai-gateway': 'Vercel AI Gateway',
  'cloudflare-workers-ai': 'Cloudflare Workers AI',
  'cloudflare-ai-gateway': 'Cloudflare AI Gateway',
  zai: 'ZAI',
  opencode: 'OpenCode',
  'opencode-go': 'OpenCode Go',
  'kimi-coding': 'Kimi',
  minimax: 'MiniMax',
  'minimax-cn': 'MiniMax CN',
  moonshotai: 'Moonshot AI',
  'moonshotai-cn': 'Moonshot AI (China)',
  fireworks: 'Fireworks',
  xiaomi: 'Xiaomi MiMo',
};

const PROVIDER_LOGO_MAP: Record<string, string> = {
  'openai-codex': 'openai',
  'google-vertex': 'google-vertex',
  'azure-openai-responses': 'azure',
  'amazon-bedrock': 'amazon-bedrock',
  'github-copilot': 'github-copilot',
  'vercel-ai-gateway': 'vercel',
  'cloudflare-workers-ai': 'cloudflare',
  'cloudflare-ai-gateway': 'cloudflare',
  'kimi-coding': 'openai',
  moonshotai: 'moonshotai',
  'moonshotai-cn': 'moonshotai',
};

function titleizeProviderId(provider: string): string {
  return provider.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function providerLogo(provider: string): string {
  const manifestLogo = getPackageProviderManifest(provider)?.logo;
  if (manifestLogo) {
    if (/^https?:\/\//.test(manifestLogo)) return manifestLogo;
    return `https://models.dev/logos/${manifestLogo}.svg`;
  }

  const slug = PROVIDER_LOGO_MAP[provider] ?? provider;
  return `https://models.dev/logos/${slug}.svg`;
}

export function providerDisplayName(provider: string): string {
  const manifestName = getPackageProviderManifest(provider)?.name;
  if (manifestName) return manifestName;
  return PROVIDER_NAMES[provider] ?? titleizeProviderId(provider);
}
