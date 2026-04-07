import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { SERO_AGENT_DIR } from '../../platform/env';
import type { ModelTierSettings } from '../../../src/types/ipc';
import { getModelTiers, setModelTiers } from './model-tiers';

export interface AvailableModelSelectionRef {
  provider: string;
  modelId: string;
}

function deleteIfPresent(record: Record<string, unknown>, key: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return false;
  delete record[key];
  return true;
}

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function filterAvailableTiers(
  tiers: ModelTierSettings,
  availableKeys: Set<string>,
): ModelTierSettings {
  const next: ModelTierSettings = {};
  for (const [tier, entry] of Object.entries(tiers)) {
    if (!entry) continue;
    if (availableKeys.has(`${entry.provider}/${entry.modelId}`)) {
      next[tier as keyof ModelTierSettings] = entry;
    }
  }
  return next;
}

export function cleanupUnavailableModelSelections(
  availableModels: AvailableModelSelectionRef[],
): boolean {
  const settingsPath = path.join(SERO_AGENT_DIR, 'settings.json');

  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return false;
  }

  let changed = false;
  let nextSettings = { ...settings };
  const availableKeys = new Set(availableModels.map((model) => `${model.provider}/${model.modelId}`));
  const availableProviders = new Set(availableModels.map((model) => model.provider));

  const defaultProvider = trimString(nextSettings.defaultProvider);
  const defaultModel = trimString(nextSettings.defaultModel);

  if (availableModels.length === 0) {
    changed = deleteIfPresent(nextSettings, 'defaultProvider') || changed;
    changed = deleteIfPresent(nextSettings, 'defaultModel') || changed;
  } else {
    if (defaultProvider && !availableProviders.has(defaultProvider)) {
      changed = deleteIfPresent(nextSettings, 'defaultProvider') || changed;
      changed = deleteIfPresent(nextSettings, 'defaultModel') || changed;
    } else if (defaultModel && (!defaultProvider || !availableKeys.has(`${defaultProvider}/${defaultModel}`))) {
      changed = deleteIfPresent(nextSettings, 'defaultModel') || changed;
    }
  }

  const currentTiers = getModelTiers(nextSettings);
  const filteredTiers = filterAvailableTiers(currentTiers, availableKeys);
  if (JSON.stringify(currentTiers) !== JSON.stringify(filteredTiers)) {
    nextSettings = setModelTiers(nextSettings, filteredTiers);
    changed = true;
  }

  if (!changed) return false;

  writeFileSync(settingsPath, JSON.stringify(nextSettings, null, 2) + '\n', 'utf8');
  return true;
}
