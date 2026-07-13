import type { Api, Model } from '@earendil-works/pi-ai';
import type { ModelRegistry, SettingsManager } from '@earendil-works/pi-coding-agent';
import { getConfiguredModelFallbackChain } from '../settings/model-fallback-chain';
import { getModelTiers } from '../settings/model-tiers';

/** Pick the first available model using tier settings, then fallback chain. */
export function pickFirstAvailableModel(
  registry: ModelRegistry,
  settingsManager: ReturnType<typeof SettingsManager.create>,
): Model<Api> | null {
  const available = registry.getAvailable();
  if (available.length === 0) return null;

  const globalSettings = settingsManager.getGlobalSettings() as Record<string, unknown>;
  const tiers = getModelTiers(globalSettings);
  if (tiers.HIGH) {
    const match = available.find(
      (model) => model.provider === tiers.HIGH!.provider && model.id === tiers.HIGH!.modelId,
    );
    if (match) return match;
  }

  const chain = getConfiguredModelFallbackChain(globalSettings);
  for (const candidate of chain) {
    const match = available.find((model) => model.id === candidate);
    if (match) return match;
  }

  return available[0] ?? null;
}
