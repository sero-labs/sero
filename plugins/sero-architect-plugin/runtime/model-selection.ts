import { modelKey } from '@sero-ai/common';
import type { ArchitectHost } from './host';

/** Keep a delegated Room inside the model choices the user made in Admin. */
export async function roomModelLimits(host: Pick<ArchitectHost, 'modelTiers'>) {
  const tiers = Object.values(await host.modelTiers());
  if (!tiers.length) throw new Error('Select models in Admin before starting an Architect Room.');
  return {
    models: [...new Set(tiers.map((entry) => modelKey(entry.provider, entry.modelId)))],
    thinkingLevels: [...new Set(tiers.map((entry) => entry.thinkingLevel ?? 'medium'))],
  };
}
