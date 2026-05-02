import type {
  LocalProviderConfig,
  LocalModelApi,
  LocalModelCompat,
  LocalProviderPreset,
} from '@/types/local-models';
import { PROVIDER_PRESETS } from './presets';

const AUTO_REPLACE_PRESET_NAMES = new Set([
  PROVIDER_PRESETS.ollama.label.toLowerCase(),
  PROVIDER_PRESETS['lm-studio'].label.toLowerCase(),
  PROVIDER_PRESETS.vllm.label.toLowerCase(),
]);

export const API_OPTIONS: { value: LocalModelApi; label: string }[] = [
  { value: 'openai-completions', label: 'OpenAI Completions' },
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'anthropic-messages', label: 'Anthropic Messages' },
  { value: 'google-generative-ai', label: 'Google Generative AI' },
];

function hasAdvancedCompat(compat?: LocalModelCompat): boolean {
  if (!compat) return false;
  return Object.keys(compat).some(
    (key) => key !== 'supportsDeveloperRole' && key !== 'supportsReasoningEffort',
  );
}

export function hasAdvancedSettings(config?: LocalProviderConfig | null): boolean {
  if (!config) return false;
  if (config.headers || config.authHeader || config.modelOverrides || hasAdvancedCompat(config.compat)) {
    return true;
  }
  return (config.models ?? []).some((model) => !!model.headers || hasAdvancedCompat(model.compat));
}

export function buildCompat(
  existingCompat: LocalModelCompat | undefined,
  supportsDeveloperRole: boolean,
  supportsReasoningEffort: boolean,
): LocalModelCompat | undefined {
  const compat: LocalModelCompat = { ...(existingCompat ?? {}) };

  if (supportsDeveloperRole) delete compat.supportsDeveloperRole;
  else compat.supportsDeveloperRole = false;

  if (supportsReasoningEffort) delete compat.supportsReasoningEffort;
  else compat.supportsReasoningEffort = false;

  return Object.keys(compat).length > 0 ? compat : undefined;
}

export function shouldReplacePresetName(currentName: string): boolean {
  const normalizedName = currentName.trim().toLowerCase();
  if (!normalizedName) {
    return true;
  }

  return AUTO_REPLACE_PRESET_NAMES.has(normalizedName);
}

export function getPresetName(preset: LocalProviderPreset): string {
  return PROVIDER_PRESETS[preset].label.toLowerCase().replace(/\s+/g, '-');
}

export function normalizeProviderName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}
