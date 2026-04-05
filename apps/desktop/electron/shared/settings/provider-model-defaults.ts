import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import type {
  ModelTier,
  ProviderTierDefaults,
  ProviderModelDefaults,
  ResolvedProviderDefaultsState,
} from '../../../src/types/ipc';
import { SERO_FIXED_ROOT } from '../../platform/env';

const TIERS: readonly ModelTier[] = ['LOW', 'MED', 'HIGH'] as const;
const GLOBAL_PROVIDER_DEFAULTS_PATH = path.join(SERO_FIXED_ROOT, 'provider-model-defaults.json');

const BUILTIN_PROVIDER_MODEL_DEFAULTS: ProviderModelDefaults = {
  openai: {
    LOW: 'gpt-4.1-mini',
    MED: 'gpt-5.4',
    HIGH: 'gpt-5.4',
  },
  openrouter: {
    LOW: 'gpt-4.1-mini',
    MED: 'gpt-5.4',
    HIGH: 'gpt-5.4',
  },
  google: {
    LOW: 'gemini-2.5-flash',
    MED: 'gemini-2.5-pro',
    HIGH: 'gemini-2.5-pro',
  },
  anthropic: {
    LOW: 'claude-haiku-4-5',
    MED: 'claude-sonnet-4-6',
    HIGH: 'claude-sonnet-4-6',
  },
};

function normalizeTierDefaults(value: unknown): ProviderTierDefaults {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const record = value as Record<string, unknown>;
  const result: ProviderTierDefaults = {};
  for (const tier of TIERS) {
    const modelId = record[tier];
    if (typeof modelId !== 'string') continue;
    const trimmed = modelId.trim();
    if (!trimmed) continue;
    result[tier] = trimmed;
  }
  return result;
}

function normalizeProviderDefaults(value: unknown): ProviderModelDefaults {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const record = value as Record<string, unknown>;
  const result: ProviderModelDefaults = {};
  for (const [providerId, tierDefaults] of Object.entries(record)) {
    const normalizedProviderId = providerId.trim();
    if (!normalizedProviderId) continue;
    const normalizedTierDefaults = normalizeTierDefaults(tierDefaults);
    if (Object.keys(normalizedTierDefaults).length === 0) continue;
    result[normalizedProviderId] = normalizedTierDefaults;
  }
  return result;
}

function getSeroSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const raw = settings.sero;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function mergeProviderDefaults(...defaultsList: Array<ProviderModelDefaults | undefined>): ProviderModelDefaults {
  const result: ProviderModelDefaults = {};

  for (const defaults of defaultsList) {
    if (!defaults) continue;
    for (const [providerId, tierDefaults] of Object.entries(defaults)) {
      const current = result[providerId] ?? {};
      result[providerId] = {
        ...current,
        ...tierDefaults,
      };
    }
  }

  return result;
}

export function getGlobalProviderDefaultsPath(): string {
  return GLOBAL_PROVIDER_DEFAULTS_PATH;
}

export function getBuiltInProviderModelDefaults(): ProviderModelDefaults {
  return JSON.parse(JSON.stringify(BUILTIN_PROVIDER_MODEL_DEFAULTS)) as ProviderModelDefaults;
}

export function readGlobalProviderModelDefaults(): ProviderModelDefaults {
  try {
    if (!existsSync(GLOBAL_PROVIDER_DEFAULTS_PATH)) return {};
    const raw = readFileSync(GLOBAL_PROVIDER_DEFAULTS_PATH, 'utf8');
    return normalizeProviderDefaults(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function writeGlobalProviderModelDefaults(defaults: ProviderModelDefaults): void {
  mkdirSync(path.dirname(GLOBAL_PROVIDER_DEFAULTS_PATH), { recursive: true });
  const normalized = normalizeProviderDefaults(defaults);
  writeFileSync(
    GLOBAL_PROVIDER_DEFAULTS_PATH,
    JSON.stringify(normalized, null, 2) + '\n',
    'utf8',
  );
}

export function getProfileProviderModelDefaultsOverrides(
  settings: Record<string, unknown>,
): ProviderModelDefaults | undefined {
  const sero = getSeroSettings(settings);
  const overrides = normalizeProviderDefaults(sero.providerModelDefaultsOverrides);
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

export function resolveProviderDefaultsState(
  settings: Record<string, unknown>,
): ResolvedProviderDefaultsState {
  const builtInDefaults = getBuiltInProviderModelDefaults();
  const globalDefaults = readGlobalProviderModelDefaults();
  const profileOverrides = getProfileProviderModelDefaultsOverrides(settings);
  const effectiveDefaults = mergeProviderDefaults(builtInDefaults, globalDefaults, profileOverrides);

  return {
    builtInDefaults,
    globalDefaults,
    profileOverrides,
    effectiveDefaults,
  };
}
