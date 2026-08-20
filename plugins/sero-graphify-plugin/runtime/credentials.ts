import { MODEL_ENV_VAR } from '../shared/pricing';
import type { GraphifyBackend, ModelChoice } from '../shared/types';

export interface ProviderKey {
  envVar: string;
  key: string;
}

export type GetProviderApiKey = (providerId: string) => Promise<ProviderKey | null>;

export const BACKEND_PROVIDERS: Record<GraphifyBackend, { providerId: string | null; displayName: string }> = {
  claude: { providerId: 'anthropic', displayName: 'Anthropic API' },
  // Runs the locally installed Claude Code CLI, so the user's plan pays rather
  // than pay-as-you-go API credit. It needs no key from Sero.
  'claude-cli': { providerId: null, displayName: 'Claude Code subscription' },
  openai: { providerId: 'openai', displayName: 'OpenAI' },
  gemini: { providerId: 'google', displayName: 'Google (Gemini)' },
  deepseek: { providerId: 'deepseek', displayName: 'DeepSeek' },
  kimi: { providerId: 'moonshotai', displayName: 'Moonshot (Kimi)' },
  azure: { providerId: null, displayName: 'Azure OpenAI (environment)' },
  bedrock: { providerId: null, displayName: 'AWS Bedrock (environment)' },
  ollama: { providerId: null, displayName: 'Ollama (local)' },
};

/**
 * Variables a graphify child genuinely needs: finding its interpreter, writing
 * temporary files, reaching the network, and rendering non-ASCII paths.
 *
 * This is an allow-list because the alternative is not: graphify's community
 * naming pass takes no backend flag from us and picks a provider by scanning
 * the environment (gemini, then kimi, then claude…). Handing it the whole
 * Electron environment therefore let any stray key on the machine capture —
 * and bill — that pass, whatever the panel said the backend was.
 */
const ALLOWED_ENV_KEYS = [
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL',
  'TMPDIR', 'TEMP', 'TMP',
  'LANG', 'LC_ALL', 'LC_CTYPE',
  // Windows needs these to spawn anything at all.
  'SystemRoot', 'SYSTEMROOT', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
  'ProgramData', 'ProgramFiles', 'ComSpec', 'PATHEXT', 'NUMBER_OF_PROCESSORS',
  // Corporate networks: without these the API calls simply fail.
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE',
] as const;

/** Backends Sero holds no credential for, which read their own environment. */
const BACKEND_PASSTHROUGH: Partial<Record<GraphifyBackend, readonly string[]>> = {
  bedrock: ['AWS_PROFILE', 'AWS_REGION', 'AWS_DEFAULT_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'],
  azure: ['AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_DEPLOYMENT'],
  ollama: ['OLLAMA_BASE_URL'],
};

/**
 * graphify reads an empty HTTP 200 — a rate limit, a refusal, a dropped
 * connection — as a truncated answer, then splits the chunk and retries each
 * half, recursively. Upstream issue #2880 measured an 18x token blow-up from
 * one bad response. Capping the retries bounds that until the fix lands.
 */
export const MAX_RETRIES = '1';

export function cleanEnv(backend: GraphifyBackend, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of [...ALLOWED_ENV_KEYS, ...(BACKEND_PASSTHROUGH[backend] ?? [])]) {
    const value = baseEnv[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

/**
 * Child-process environment for a paid graphify pass.
 *
 * Sets the model twice on purpose. `--model` covers extraction; the community
 * naming pass resolves `_default_model_for_backend(backend)` and ignores the
 * flag entirely, so only the backend's own model variable reaches it.
 */
export async function extractionEnv(
  choice: ModelChoice,
  getProviderApiKey: GetProviderApiKey,
  baseEnv: NodeJS.ProcessEnv = process.env,
  overlay: NodeJS.ProcessEnv = {},
): Promise<NodeJS.ProcessEnv> {
  const mapping = BACKEND_PROVIDERS[choice.backend];
  const env = { ...cleanEnv(choice.backend, baseEnv), ...overlay };
  if (mapping.providerId) {
    const provider = await getProviderApiKey(mapping.providerId);
    if (!provider) {
      throw new Error(`No API key configured for ${mapping.displayName}. Add one in Sero settings or choose another backend.`);
    }
    env[provider.envVar] = provider.key;
  }
  const modelVar = MODEL_ENV_VAR[choice.backend];
  if (modelVar) env[modelVar] = choice.modelId;
  env.GRAPHIFY_MAX_RETRIES = MAX_RETRIES;
  return env;
}
