import { getSupportedThinkingLevels, type Api, type Model } from '@mariozechner/pi-ai';
import { THINKING_LEVELS, type ThinkingLevel } from '@sero-ai/common';
import type { AvailableModelGroup } from '@/types/ipc';
import { providerDisplayName, providerLogo } from '@electron/ipc/platform/auth';

type RegistryModelLike = Pick<Model<Api>, 'provider' | 'id' | 'name' | 'reasoning' | 'thinkingLevelMap'>;

function toAvailableThinkingLevels(model: RegistryModelLike): ThinkingLevel[] {
  const supported = getSupportedThinkingLevels(model as Model<Api>);
  return THINKING_LEVELS.filter((level) => supported.includes(level));
}

export function buildAvailableModelGroups(
  available: RegistryModelLike[],
): AvailableModelGroup[] {
  const grouped = new Map<string, RegistryModelLike[]>();

  for (const model of available) {
    const list = grouped.get(model.provider) ?? [];
    list.push(model);
    grouped.set(model.provider, list);
  }

  return [...grouped.entries()].map(([provider, models]) => ({
    provider,
    displayName: providerDisplayName(provider),
    logo: providerLogo(provider),
    models: models.map((model) => {
      const availableThinkingLevels = toAvailableThinkingLevels(model);
      return {
        provider: model.provider,
        modelId: model.id,
        name: model.name,
        reasoning: model.reasoning,
        availableThinkingLevels,
        supportsXhigh: availableThinkingLevels.includes('xhigh'),
      };
    }),
  }));
}
