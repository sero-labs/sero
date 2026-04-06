/**
 * Provider display names and logo mappings.
 *
 * Static metadata used by the model selector and session info display.
 * Extracted from agent-helpers.ts to keep it under 500 LOC.
 */

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
  'alibaba-cloud': 'Alibaba Cloud',
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
  'alibaba-cloud': 'alibaba-cloud',
};

export function providerLogo(provider: string): string {
  const slug = PROVIDER_LOGO_MAP[provider] ?? provider;
  return `https://models.dev/logos/${slug}.svg`;
}

export function providerDisplayName(provider: string): string {
  return PROVIDER_NAMES[provider] ?? provider.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
