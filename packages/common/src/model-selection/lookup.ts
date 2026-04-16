import type { ThinkingLevel } from './types';
import {
  MODEL_TIERS,
  THINKING_LEVELS,
  type ModelTier,
  type SharedAvailableModelGroup,
  type SharedModelInfo,
  type SharedModelTierEntry,
} from './types';

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
