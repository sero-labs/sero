import type { Api, Model } from '@mariozechner/pi-ai';
import { type ModelRegistry, type SettingsManager } from '@mariozechner/pi-coding-agent';
import { getConfiguredModelFallbackChain } from '../settings/model-fallback-chain';
import { getModelTiers } from '../settings/model-tiers';
import { subagentManager } from './singletons';

/** Apply runtime-only settings that need to update live singletons. */
export function applyRuntimeSettings(
  settingsManager: ReturnType<typeof SettingsManager.create>,
): void {
  const raw = (settingsManager.getGlobalSettings() as Record<string, unknown>)?.subagent as Record<string, unknown> | undefined;

  subagentManager.updateSettings({
    maxConcurrent: typeof raw?.maxConcurrent === 'number' ? raw.maxConcurrent : undefined,
    maxTotal: typeof raw?.maxTotal === 'number' ? raw.maxTotal : undefined,
    timeoutMs: typeof raw?.timeoutMs === 'number' ? raw.timeoutMs : undefined,
    model: typeof raw?.model === 'string' ? raw.model : undefined,
    thinking: typeof raw?.thinking === 'string' ? raw.thinking : undefined,
  });
}

/**
 * Pick the first available model using tier settings, then fallback chain.
 * Returns null if no model is available (no auth configured yet).
 */
export function pickFirstAvailableModel(
  registry: ModelRegistry,
  settingsManager: ReturnType<typeof SettingsManager.create>,
): Model<Api> | null {
  const available = registry.getAvailable();
  if (available.length === 0) return null;

  const globalSettings = settingsManager.getGlobalSettings() as Record<string, unknown>;

  // Try HIGH tier model first (most capable, used for main sessions)
  const tiers = getModelTiers(globalSettings);
  if (tiers.HIGH) {
    const match = available.find(
      (model) => model.provider === tiers.HIGH!.provider && model.id === tiers.HIGH!.modelId,
    );
    if (match) return match;
  }

  // Try fallback chain
  const chain = getConfiguredModelFallbackChain(globalSettings);
  for (const candidate of chain) {
    const match = available.find((model) => model.id === candidate);
    if (match) return match;
  }

  // Last resort: first available model
  return available[0] ?? null;
}
