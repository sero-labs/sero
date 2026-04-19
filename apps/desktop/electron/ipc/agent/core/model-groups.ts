import {
  getAvailableThinkingLevels,
  inferSupportsXhigh,
} from '@sero-ai/common';
import type { AvailableModelGroup } from '@/types/ipc';
import { providerDisplayName, providerLogo } from '@electron/ipc/platform/auth';

interface RegistryModelLike {
  provider: string;
  id: string;
  name: string;
  reasoning: boolean;
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
      const supportsXhigh = inferSupportsXhigh(model.id);
      return {
        provider: model.provider,
        modelId: model.id,
        name: model.name,
        reasoning: model.reasoning,
        supportsXhigh,
        availableThinkingLevels: getAvailableThinkingLevels({
          provider: model.provider,
          modelId: model.id,
          name: model.name,
          reasoning: model.reasoning,
          supportsXhigh,
        }),
      };
    }),
  }));
}
