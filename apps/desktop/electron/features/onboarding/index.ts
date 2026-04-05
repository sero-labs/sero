import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import type { ModelTierSettings } from '../../../src/types/ipc';
import { SERO_AGENT_DIR } from '../../platform/env';
import { getOnboardingState } from './preflight';
import { setModelTiers } from '../../shared/settings/model-tiers';

export { getOnboardingState } from './preflight';

export async function saveOnboardingTierSelections(tiers: ModelTierSettings): Promise<void> {
  const settingsPath = path.join(SERO_AGENT_DIR, 'settings.json');
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
  } catch {
    settings = {};
  }

  const nextSettings = setModelTiers(settings, tiers);
  writeFileSync(settingsPath, JSON.stringify(nextSettings, null, 2) + '\n', 'utf8');
}
