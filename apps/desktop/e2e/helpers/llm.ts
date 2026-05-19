import fs from 'node:fs';
import path from 'node:path';

export type LlmMode = 'off' | 'cheap' | 'full';

const VALID_MODES: ReadonlyArray<LlmMode> = ['off', 'cheap', 'full'];
const DEFAULT_PROVIDER = 'anthropic';
const ENV_FILE = path.resolve(__dirname, '..', '.env.test');
const CREDENTIAL_ENV_VARS: Record<string, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  google: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
};
const DEFAULT_MODELS: Record<string, Record<Exclude<LlmMode, 'off'>, string>> = {
  anthropic: { cheap: 'claude-haiku-4-5', full: 'claude-sonnet-4-6' },
  openai: { cheap: 'gpt-5.4-mini', full: 'gpt-5.5' },
  google: { cheap: 'gemini-3-flash-preview', full: 'gemini-3-pro-preview' },
};

const loadedEnvFiles = new Map<string, Record<string, string>>();

export interface LlmConfig {
  mode: Exclude<LlmMode, 'off'>;
  provider: string;
  modelId: string;
  alternateModelId?: string;
}

export interface RequireLlmResult {
  skip: boolean;
  reason?: string;
}

export function loadE2eEnv(file = ENV_FILE): Record<string, string> {
  const resolvedFile = path.resolve(file);
  const loaded = loadedEnvFiles.get(resolvedFile);
  if (loaded) return { ...loaded };

  const values: Record<string, string> = {};
  if (!fs.existsSync(resolvedFile)) {
    loadedEnvFiles.set(resolvedFile, values);
    return values;
  }

  const lines = fs.readFileSync(resolvedFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    values[key] = value;
  }
  loadedEnvFiles.set(resolvedFile, values);
  return { ...values };
}

export function getLlmMode(): LlmMode {
  const raw = getE2eEnvValue('SERO_E2E_LLM_MODE');
  if (raw === undefined || raw === '') return 'off';
  if ((VALID_MODES as ReadonlyArray<string>).includes(raw)) {
    return raw as LlmMode;
  }
  throw new Error(
    `Invalid SERO_E2E_LLM_MODE="${raw}". Expected one of: ${VALID_MODES.join(', ')}.`,
  );
}

export function getLlmConfig(): LlmConfig | null {
  const mode = getLlmMode();
  if (mode === 'off') return null;
  const provider = (getE2eEnvValue('SERO_E2E_LLM_PROVIDER') || DEFAULT_PROVIDER).trim();
  const defaults = DEFAULT_MODELS[provider];
  const modelId = (getE2eEnvValue('SERO_E2E_LLM_MODEL') || defaults?.[mode] || '').trim();
  const alternateModelId = getE2eEnvValue('SERO_E2E_LLM_ALT_MODEL')?.trim();
  if (!modelId) {
    throw new Error(
      `No default model for SERO_E2E_LLM_PROVIDER="${provider}". Set SERO_E2E_LLM_MODEL.`,
    );
  }
  return alternateModelId ? { mode, provider, modelId, alternateModelId } : { mode, provider, modelId };
}

export function getLlmCredentialEnvVars(provider: string): string[] {
  return CREDENTIAL_ENV_VARS[provider] ?? [`${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`];
}

export function getLlmCredentialEnvKeys(): string[] {
  return Array.from(new Set(Object.values(CREDENTIAL_ENV_VARS).flat()));
}

export function hasLlmCredentials(provider: string): boolean {
  return getLlmCredentialEnvVars(provider).some((key) => Boolean(getE2eEnvValue(key)?.trim()));
}

export function getLlmLaunchEnv(): Record<string, string> {
  const config = getLlmConfig();
  const env: Record<string, string> = {};
  if (!config) return env;

  env.SERO_E2E_LLM_MODE = config.mode;
  env.SERO_E2E_LLM_PROVIDER = config.provider;
  env.SERO_E2E_LLM_MODEL = config.modelId;
  if (config.alternateModelId) env.SERO_E2E_LLM_ALT_MODEL = config.alternateModelId;

  for (const key of getLlmCredentialEnvVars(config.provider)) {
    const value = getE2eEnvValue(key);
    if (value) env[key] = value;
  }
  return env;
}

export function requireLlm(): RequireLlmResult {
  const mode = getLlmMode();
  if (mode === 'off') {
    return {
      skip: true,
      reason: 'SERO_E2E_LLM_MODE=off — agent-realism tests skipped. Set to "cheap" or "full" to enable.',
    };
  }
  return { skip: false };
}

export function requireLlmReady(): RequireLlmResult {
  const base = requireLlm();
  if (base.skip) return base;

  const config = getLlmConfig();
  if (!config) return base;
  if (!hasLlmCredentials(config.provider)) {
    const reason = `No API key found for SERO_E2E_LLM_PROVIDER=${config.provider}. Set one of ${getLlmCredentialEnvVars(config.provider).join(', ')}.`;
    if (process.env.CI === 'true') {
      throw new Error(`${reason} CI agent e2e runs must fail fast instead of skipping provider-backed coverage.`);
    }
    return { skip: true, reason };
  }
  return { skip: false };
}

function getE2eEnvValue(key: string): string | undefined {
  if (process.env[key] !== undefined) return process.env[key];
  if (process.env.SERO_E2E_SKIP_ENV_FILE === '1') return undefined;
  return loadE2eEnv()[key];
}

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const equalsIndex = trimmed.indexOf('=');
  if (equalsIndex === -1) return null;

  const key = trimmed.slice(0, equalsIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  const rawValue = trimmed.slice(equalsIndex + 1).trim();
  return [key, unquoteEnvValue(rawValue)];
}

function unquoteEnvValue(value: string): string {
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value[value.length - 1] === quote) {
    return value.slice(1, -1);
  }
  const hashIndex = value.indexOf(' #');
  return hashIndex === -1 ? value : value.slice(0, hashIndex).trimEnd();
}
