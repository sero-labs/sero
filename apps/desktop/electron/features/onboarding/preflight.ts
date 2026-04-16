import { access, readFile } from 'fs/promises';
import path from 'path';
import type {
  AvailableModelGroup,
  ModelTier,
  OnboardingState,
  OnboardingWarning,
} from '@/types/ipc';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import { profileManager } from '../profile/manager';
import {
  readSettingsResult,
  writeSettings,
} from '@electron/shared/settings/settings-helpers';
import {
  applyLegacyProviderDefaultsMigration,
  getGlobalModelConfigTiers,
} from '@electron/shared/settings/model-config';
import { cleanupUnavailableModelSelections } from '@electron/shared/settings/cleanup-unavailable-model-selections';
import { buildOnboardingRecommendation, validateCurrentTiers } from './recommendations';
import { getProviderHealthSnapshot } from './provider-health';
import { emptyOnboardingState } from './types';

interface BuildOnboardingStateOptions {
  applyRepairs: boolean;
}

function readLegacyDefaultProvider(settings: Record<string, unknown>): string | null {
  const sero = settings.sero;
  if (!sero || typeof sero !== 'object' || Array.isArray(sero)) return null;
  const value = (sero as Record<string, unknown>).defaultProvider;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function hasSavedAuthJson(): Promise<boolean> {
  const authPath = path.join(SERO_AGENT_DIR, 'auth.json');
  try {
    const content = (await readFile(authPath, 'utf8')).trim();
    return content.length > 2 && content !== '{}';
  } catch {
    return false;
  }
}

function formatTierLabel(tier: ModelTier): string {
  if (tier === 'LOW') return 'Low';
  if (tier === 'MED') return 'Medium';
  return 'High';
}

async function hasCompletedMemoryBootstrap(profilePath: string): Promise<boolean> {
  const memoryPath = path.join(profilePath, 'workspaces', 'global', 'MEMORY.md');
  try {
    await access(memoryPath);
    return true;
  } catch {
    return false;
  }
}

function formatProviderNames(providerIds: string[], providerHealth: OnboardingState['providerHealth']): string {
  const byId = new Map(providerHealth.map((provider) => [provider.providerId, provider.displayName]));
  return providerIds
    .map((providerId) => byId.get(providerId) ?? providerId)
    .sort((a, b) => a.localeCompare(b))
    .join(', ');
}

function buildWarnings(args: {
  hasAnyUsableModels: boolean;
  invalidTiers: ModelTier[];
  brokenProviderIds: string[];
  providerHealth: OnboardingState['providerHealth'];
}): OnboardingWarning[] {
  const warnings: OnboardingWarning[] = [];
  const { hasAnyUsableModels, invalidTiers, brokenProviderIds, providerHealth } = args;

  if (invalidTiers.length > 0) {
    warnings.push({
      code: 'invalid_existing_tiers',
      message: `Some saved model selections are no longer available: ${invalidTiers.map(formatTierLabel).join(', ')}.`,
    });
  }

  if (brokenProviderIds.length > 0 && hasAnyUsableModels) {
    warnings.push({
      code: 'broken_imported_providers',
      message: `Some saved providers need attention: ${formatProviderNames(brokenProviderIds, providerHealth)}.`,
      providerIds: brokenProviderIds,
    });
  }

  if (!hasAnyUsableModels) {
    warnings.push({
      code: 'no_usable_models',
      message: brokenProviderIds.length > 0
        ? `Reconnect ${formatProviderNames(brokenProviderIds, providerHealth)} or add another provider to continue.`
        : 'Connect at least one provider to continue.',
      providerIds: brokenProviderIds.length > 0 ? brokenProviderIds : undefined,
    });
  }

  return warnings;
}

function toAvailableSelections(availableModelGroups: AvailableModelGroup[]): Array<{ provider: string; modelId: string }> {
  return availableModelGroups.flatMap((group) =>
    group.models.map((model) => ({
      provider: model.provider,
      modelId: model.modelId,
    })));
}

function readSettingsForOnboarding(): Record<string, unknown> {
  const result = readSettingsResult();
  if (!result.ok) {
    throw result.error;
  }
  return result.settings;
}

export function repairOnboardingSettingsState(availableModelGroups: AvailableModelGroup[]): Record<string, unknown> {
  let settings = readSettingsForOnboarding();
  const migrated = applyLegacyProviderDefaultsMigration(settings);
  settings = migrated.settings;
  if (migrated.changed) {
    writeSettings(settings);
  }

  const cleaned = cleanupUnavailableModelSelections(toAvailableSelections(availableModelGroups));
  if (cleaned) {
    settings = readSettingsForOnboarding();
  }

  return settings;
}

function buildPendingOnboardingState(args: {
  availableModelGroups: AvailableModelGroup[];
  providerHealth: OnboardingState['providerHealth'];
  hasImportedCredentials: boolean;
  memoryBootstrapComplete: boolean;
  settings: Record<string, unknown>;
}): OnboardingState {
  const {
    availableModelGroups,
    providerHealth,
    hasImportedCredentials,
    memoryBootstrapComplete,
    settings,
  } = args;
  const hasAnyUsableModels = availableModelGroups.some((group) => group.models.length > 0);
  const currentTiers = getGlobalModelConfigTiers(settings);
  const brokenProviderIds = providerHealth
    .filter((provider) => provider.status === 'broken_expired' || provider.status === 'broken_invalid')
    .map((provider) => provider.providerId);

  const { recommendation, invalidTiers } = hasAnyUsableModels
    ? buildOnboardingRecommendation({
      availableModelGroups,
      currentTiers,
      providerHealth,
      legacyDefaultProvider: readLegacyDefaultProvider(settings),
    })
    : {
      recommendation: null,
      invalidTiers: validateCurrentTiers(availableModelGroups, currentTiers).invalidTiers,
    };

  return {
    needed: true,
    phase: hasAnyUsableModels ? 'ready' : 'auth',
    hasAnyUsableModels,
    hasImportedCredentials,
    memoryBootstrapComplete,
    recommendation,
    providerHealth,
    availableModelGroups,
    warnings: buildWarnings({
      hasAnyUsableModels,
      invalidTiers,
      brokenProviderIds,
      providerHealth,
    }),
    invalidTiers,
  };
}

async function buildOnboardingState(options: BuildOnboardingStateOptions): Promise<OnboardingState> {
  const activeProfile = profileManager.getActive();
  if (!activeProfile) {
    return emptyOnboardingState();
  }

  const [memoryBootstrapComplete, { availableModelGroups, providerHealth }, hasImportedCredentials] = await Promise.all([
    hasCompletedMemoryBootstrap(activeProfile.path),
    getProviderHealthSnapshot(),
    hasSavedAuthJson(),
  ]);

  const hasAnyUsableModels = availableModelGroups.some((group) => group.models.length > 0);

  if (!activeProfile.onboarded) {
    const settings = options.applyRepairs
      ? repairOnboardingSettingsState(availableModelGroups)
      : readSettingsForOnboarding();
    return buildPendingOnboardingState({
      availableModelGroups,
      providerHealth,
      hasImportedCredentials,
      memoryBootstrapComplete,
      settings,
    });
  }

  return {
    ...emptyOnboardingState(),
    hasAnyUsableModels,
    hasImportedCredentials,
    memoryBootstrapComplete,
    providerHealth,
    availableModelGroups,
  };
}

export async function getOnboardingState(): Promise<OnboardingState> {
  return buildOnboardingState({ applyRepairs: false });
}

export async function getOnboardingStateWithRepairs(): Promise<OnboardingState> {
  return buildOnboardingState({ applyRepairs: true });
}
