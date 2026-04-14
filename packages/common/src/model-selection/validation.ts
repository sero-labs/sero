import {
  MODEL_TIERS,
  type AgentModelPreference,
  type ModelTier,
  type ModelValidationWarning,
  type SharedAvailableModelGroup,
  type SharedModelInfo,
  type SharedModelTierSettings,
  type ThinkingLevel,
} from './types';
import {
  findModel,
  findModelByReference,
  formatModelRef,
  getAvailableThinkingLevels,
  getModelTierThinkingLevel,
  isModelTier,
  supportsThinkingLevel,
} from './lookup';

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

export function formatModelValidationWarning(warning: ModelValidationWarning): string {
  switch (warning.code) {
    case 'missing_global_tier':
      return `${warning.tier} is set to ${formatModelRef(warning.provider, warning.modelId)}, but that model is not currently available.`;
    case 'unsupported_tier_thinking':
      return `${warning.tier} thinking is ${warning.requestedThinkingLevel}, but ${warning.modelName} only supports up to ${warning.maxSupportedThinkingLevel}.`;
    case 'missing_agent_model':
      if (warning.preferenceKind === 'direct') {
        return `This agent is set to ${warning.preferredLabel}, but that model is not currently available.`;
      }
      if (warning.allFallbacksUnavailable) {
        return `This agent's preferred model (${warning.preferredLabel}) and all configured fallbacks are unavailable.`;
      }
      return `This agent's preferred model (${warning.preferredLabel}) is unavailable.`;
    case 'missing_agent_tier':
      if (warning.allFallbacksUnavailable) {
        return `This agent prefers ${warning.tier}, but that global tier is unset or unavailable, and none of its fallbacks are available.`;
      }
      return `This agent uses ${warning.tier}, but that global tier is unset or unavailable.`;
    case 'agent_fallback_only':
      return `This agent's preferred model (${warning.preferredLabel}) is unavailable. Runtime will fall back to ${warning.fallbackLabel}.`;
  }
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
        provider: entry.provider,
        modelId: entry.modelId,
      });
      continue;
    }

    const thinkingLevel = getModelTierThinkingLevel(entry);
    if (supportsThinkingLevel(model, thinkingLevel)) continue;

    warnings.push({
      code: 'unsupported_tier_thinking',
      severity: 'warning',
      tier,
      modelName: model.name,
      requestedThinkingLevel: thinkingLevel,
      maxSupportedThinkingLevel: describeMaxThinking(model),
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
      }];
    }
    return [{
      code: 'missing_agent_model',
      severity: 'warning',
      preferredLabel: result.label,
      preferenceKind: 'direct',
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
      preferredLabel,
      fallbackLabel: availableFallbacks[0].label,
    }];
  }

  if (preferred.type === 'missing-tier') {
    return [{
      code: 'missing_agent_tier',
      severity: 'warning',
      tier: preferred.tier,
      allFallbacksUnavailable: true,
    }];
  }

  return [{
    code: 'missing_agent_model',
    severity: 'warning',
    preferredLabel: preferred.label,
    preferenceKind: 'preferred',
    allFallbacksUnavailable: true,
  }];
}
