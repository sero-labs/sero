/**
 * Provider display names and logo mappings.
 *
 * Static metadata used by the model selector and session info display.
 * Extracted from agent-helpers.ts to keep it under 500 LOC.
 */

import { getPackageProviderManifest } from '@electron/shared/providers/package-provider-manifests';

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  'openai-codex': 'OpenAI (Codex)',
  google: 'Google',
  'google-gemini-cli': 'Google (Gemini CLI)',
  'google-antigravity': 'Antigravity',
  'google-vertex': 'Google Vertex',
  xai: 'xAI',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  cerebras: 'Cerebras',
  mistral: 'Mistral',
  'github-copilot': 'GitHub Copilot',
  'amazon-bedrock': 'Amazon Bedrock',
  'azure-openai-responses': 'Azure OpenAI',
  huggingface: 'Hugging Face',
  'vercel-ai-gateway': 'Vercel AI Gateway',
  zai: 'ZAI',
  opencode: 'OpenCode',
  'kimi-coding': 'Kimi',
  minimax: 'MiniMax',
  'minimax-cn': 'MiniMax CN',
};

const PROVIDER_LOGO_MAP: Record<string, string> = {
  'openai-codex': 'openai',
  'google-gemini-cli': 'google',
  'google-antigravity': 'google',
  'google-vertex': 'google-vertex',
  'azure-openai-responses': 'azure',
  'amazon-bedrock': 'amazon-bedrock',
  'github-copilot': 'github-copilot',
  'vercel-ai-gateway': 'vercel',
  'kimi-coding': 'openai',
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
