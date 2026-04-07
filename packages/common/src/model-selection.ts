/**
 * Shared model-selection helpers used across desktop and plugin UIs.
 *
 * Keep this file renderer-safe and framework-agnostic.
 */

import type { ThinkingLevel } from '@mariozechner/pi-agent-core';

export type { ThinkingLevel };

export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const satisfies readonly ThinkingLevel[];

export const THINKING_LABELS: Record<ThinkingLevel, string> = {
  off: 'Off',
  minimal: 'Min',
  low: 'Low',
  medium: 'Med',
  high: 'High',
  xhigh: 'Max',
};

export const MODEL_TIERS = ['LOW', 'MED', 'HIGH'] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

export interface SharedModelInfo {
  provider: string;
  modelId: string;
  name: string;
  reasoning: boolean;
  availableThinkingLevels?: string[];
  supportsXhigh?: boolean;
}

export interface SharedAvailableModelGroup<TModel extends SharedModelInfo = SharedModelInfo> {
  provider: string;
  displayName: string;
  logo: string;
  models: TModel[];
}

export interface SharedModelTierEntry {
  provider: string;
  modelId: string;
  thinkingLevel?: ThinkingLevel;
}

export type SharedModelTierSettings = Partial<Record<ModelTier, SharedModelTierEntry>>;

export interface StructuredModelPreference {
  prefer: string;
  fallbacks?: string[];
}

export type AgentModelPreference = string | StructuredModelPreference;

export type ModelValidationWarningCode =
  | 'missing_global_tier'
  | 'unsupported_tier_thinking'
  | 'missing_agent_model'
  | 'missing_agent_tier'
  | 'agent_fallback_only';

export interface ModelValidationWarning {
  code: ModelValidationWarningCode;
  severity: 'warning' | 'info';
  message: string;
  tier?: ModelTier;
}

const THINKING_LEVEL_SET = new Set<string>(THINKING_LEVELS);

export function modelKey(provider: string, modelId: string): string {
  return `${provider}/${modelId}`;
}

export function parseModelKey(value: string): SharedModelTierEntry | null {
  const separatorIndex = value.indexOf('/');
  if (separatorIndex <= 0) return null;
  return {
    provider: value.slice(0, separatorIndex),
    modelId: value.slice(separatorIndex + 1),
  };
}

export function formatModelRef(provider: string, modelId: string): string {
  return `${provider}/${modelId}`;
}

export function isThinkingLevel(value: string): value is ThinkingLevel {
  return THINKING_LEVEL_SET.has(value);
}

export function normalizeThinkingLevel(value: string | null | undefined): ThinkingLevel {
  const normalized = value?.trim().toLowerCase() ?? '';
  return isThinkingLevel(normalized) ? normalized : 'high';
}

export function getModelTierThinkingLevel(
  entry: Pick<SharedModelTierEntry, 'thinkingLevel'> | null | undefined,
  fallbackLevel: string = 'high',
): ThinkingLevel {
  return normalizeThinkingLevel(entry?.thinkingLevel ?? fallbackLevel);
}

export function isModelTier(value: string): value is ModelTier {
  return MODEL_TIERS.includes(value as ModelTier);
}

export function findModel<
  TModel extends SharedModelInfo,
  TGroup extends SharedAvailableModelGroup<TModel>,
>(
  groups: TGroup[],
  provider: string,
  modelId: string,
): TModel | undefined {
  for (const group of groups) {
    const model = group.models.find((entry) => entry.provider === provider && entry.modelId === modelId);
    if (model) return model;
  }
  return undefined;
}

export function findGroup<
  TModel extends SharedModelInfo,
  TGroup extends SharedAvailableModelGroup<TModel>,
>(
  groups: TGroup[],
  provider: string,
  modelId: string,
): TGroup | undefined {
  return groups.find((group) =>
    group.models.some((entry) => entry.provider === provider && entry.modelId === modelId),
  );
}

export function findModelByReference<
  TModel extends SharedModelInfo,
  TGroup extends SharedAvailableModelGroup<TModel>,
>(
  groups: TGroup[],
  reference: string,
): { model: TModel; group: TGroup } | null {
  const trimmed = reference.trim();
  if (!trimmed) return null;

  const slashIndex = trimmed.indexOf('/');
  if (slashIndex !== -1) {
    const provider = trimmed.slice(0, slashIndex).trim();
    const modelId = trimmed.slice(slashIndex + 1).trim();
    const group = findGroup(groups, provider, modelId);
    const model = group?.models.find((entry) => entry.provider === provider && entry.modelId === modelId);
    return group && model ? { model, group } : null;
  }

  let match: { model: TModel; group: TGroup } | null = null;
  const lowerId = trimmed.toLowerCase();
  for (const group of groups) {
    for (const model of group.models) {
      if (model.modelId.toLowerCase() !== lowerId) continue;
      if (match) return null;
      match = { model, group };
    }
  }

  return match;
}

export function flattenModelGroups<
  TModel extends SharedModelInfo,
  TGroup extends SharedAvailableModelGroup<TModel>,
>(
  groups: TGroup[],
): TModel[] {
  return groups.flatMap((group) => group.models);
}

export function filterModelGroups<
  TModel extends SharedModelInfo,
  TGroup extends SharedAvailableModelGroup<TModel>,
>(
  groups: TGroup[],
  query: string,
): TGroup[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return groups;

  const result: TGroup[] = [];
  for (const group of groups) {
    const models = group.models.filter((model) => {
      const searchable = `${group.displayName} ${model.name} ${model.modelId}`.toLowerCase();
      return searchable.includes(normalized);
    });
    if (models.length === 0) continue;
    result.push({ ...group, models });
  }
  return result;
}

export function inferSupportsXhigh(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return /claude-(sonnet|opus)|gpt-5|o1|o3|gemini-(2\.5|3)(-|.*)pro/.test(normalized);
}

export function getAvailableThinkingLevels(model: SharedModelInfo): ThinkingLevel[] {
  const explicit = Array.isArray(model.availableThinkingLevels)
    ? model.availableThinkingLevels
        .filter((entry): entry is ThinkingLevel => isThinkingLevel(entry))
    : [];

  if (explicit.length > 0) {
    const withOff = explicit.includes('off') ? explicit : ['off', ...explicit];
    if ((model.supportsXhigh ?? false) && !withOff.includes('xhigh')) {
      withOff.push('xhigh');
    }
    return THINKING_LEVELS.filter((level) => withOff.includes(level));
  }

  if (!model.reasoning) return ['off'];

  const inferred: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high'];
  if (model.supportsXhigh ?? inferSupportsXhigh(model.modelId)) {
    inferred.push('xhigh');
  }
  return inferred;
}

export function resolveSupportedThinkingLevel(
  model: SharedModelInfo,
  preferredLevel: string | null | undefined,
): ThinkingLevel {
  const supported = getAvailableThinkingLevels(model);
  const preferred = normalizeThinkingLevel(preferredLevel);
  if (supported.includes(preferred)) return preferred;

  const preferredIndex = THINKING_LEVELS.indexOf(preferred);
  for (let index = preferredIndex; index >= 0; index -= 1) {
    const candidate = THINKING_LEVELS[index];
    if (supported.includes(candidate)) return candidate;
  }

  return supported[supported.length - 1] ?? 'off';
}

export function supportsThinkingLevel(model: SharedModelInfo, level: string): boolean {
  if (level === 'off') return true;
  if (!isThinkingLevel(level)) return false;
  return getAvailableThinkingLevels(model).includes(level);
}

function describeMaxThinking(model: SharedModelInfo): ThinkingLevel {
  const levels = getAvailableThinkingLevels(model);
  return levels[levels.length - 1] ?? 'off';
}

function resolveAgentPreference<
  TModel extends SharedModelInfo,
  TGroup extends SharedAvailableModelGroup<TModel>,
>(
  reference: string,
  groups: TGroup[],
  tiers: SharedModelTierSettings,
):
  | { type: 'resolved'; label: string }
  | { type: 'missing-tier'; tier: ModelTier }
  | { type: 'missing-model'; label: string } {
  const trimmed = reference.trim();
  if (!trimmed) {
    return { type: 'missing-model', label: '(empty model reference)' };
  }

  if (isModelTier(trimmed)) {
    const tierEntry = tiers[trimmed];
    if (!tierEntry) return { type: 'missing-tier', tier: trimmed };
    const model = findModel(groups, tierEntry.provider, tierEntry.modelId);
    if (!model) return { type: 'missing-tier', tier: trimmed };
    return { type: 'resolved', label: `${trimmed} → ${model.name}` };
  }

  const explicit = findModelByReference(groups, trimmed);
  if (explicit) {
    return {
      type: 'resolved',
      label: formatModelRef(explicit.model.provider, explicit.model.modelId),
    };
  }

  return { type: 'missing-model', label: trimmed };
}

export function validateGlobalTierSelections<
  TModel extends SharedModelInfo,
  TGroup extends SharedAvailableModelGroup<TModel>,
>(
  tiers: SharedModelTierSettings,
  groups: TGroup[],
): ModelValidationWarning[] {
  const warnings: ModelValidationWarning[] = [];

  for (const tier of MODEL_TIERS) {
    const entry = tiers[tier];
    if (!entry) continue;

    const model = findModel(groups, entry.provider, entry.modelId);
    if (!model) {
      warnings.push({
        code: 'missing_global_tier',
        severity: 'warning',
        tier,
        message: `${tier} is set to ${formatModelRef(entry.provider, entry.modelId)}, but that model is not currently available.`,
      });
      continue;
    }

    const thinkingLevel = getModelTierThinkingLevel(entry);
    if (supportsThinkingLevel(model, thinkingLevel)) continue;

    warnings.push({
      code: 'unsupported_tier_thinking',
      severity: 'warning',
      tier,
      message: `${tier} thinking is ${thinkingLevel}, but ${model.name} only supports up to ${describeMaxThinking(model)}.`,
    });
  }

  return warnings;
}

export function validateAgentModelConfig<
  TModel extends SharedModelInfo,
  TGroup extends SharedAvailableModelGroup<TModel>,
>(
  modelConfig: AgentModelPreference | undefined,
  groups: TGroup[],
  tiers: SharedModelTierSettings,
): ModelValidationWarning[] {
  if (!modelConfig) return [];

  if (typeof modelConfig === 'string') {
    const result = resolveAgentPreference(modelConfig, groups, tiers);
    if (result.type === 'resolved') return [];
    if (result.type === 'missing-tier') {
      return [{
        code: 'missing_agent_tier',
        severity: 'warning',
        tier: result.tier,
        message: `This agent uses ${result.tier}, but that global tier is unset or unavailable.`,
      }];
    }
    return [{
      code: 'missing_agent_model',
      severity: 'warning',
      message: `This agent is set to ${result.label}, but that model is not currently available.`,
    }];
  }

  const prefer = modelConfig.prefer?.trim() ?? '';
  if (!prefer) return [];

  const preferred = resolveAgentPreference(prefer, groups, tiers);
  if (preferred.type === 'resolved') return [];

  const fallbacks = (modelConfig.fallbacks ?? [])
    .map((entry) => entry.trim())
    .filter(Boolean);

  const availableFallbacks = fallbacks
    .map((reference) => resolveAgentPreference(reference, groups, tiers))
    .filter((result): result is { type: 'resolved'; label: string } => result.type === 'resolved');

  if (availableFallbacks.length > 0) {
    const preferredLabel = preferred.type === 'missing-tier'
      ? preferred.tier
      : preferred.label;
    return [{
      code: 'agent_fallback_only',
      severity: 'info',
      message: `This agent's preferred model (${preferredLabel}) is unavailable. Runtime will fall back to ${availableFallbacks[0].label}.`,
    }];
  }

  if (preferred.type === 'missing-tier') {
    return [{
      code: 'missing_agent_tier',
      severity: 'warning',
      tier: preferred.tier,
      message: `This agent prefers ${preferred.tier}, but that global tier is unset or unavailable, and none of its fallbacks are available.`,
    }];
  }

  return [{
    code: 'missing_agent_model',
    severity: 'warning',
    message: `This agent's preferred model (${preferred.label}) and all configured fallbacks are unavailable.`,
  }];
}
