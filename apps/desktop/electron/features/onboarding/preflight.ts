import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type { ModelTier, OnboardingState, OnboardingWarning } from '../../../src/types/ipc';
import { SERO_AGENT_DIR } from '../../platform/env';
import { profileManager } from '../profile/manager';
import { getModelTiers } from '../../shared/settings/model-tiers';
import { resolveProviderDefaultsState } from '../../shared/settings/provider-model-defaults';
import { readSettings } from '../../shared/settings/settings-helpers';
import { buildOnboardingRecommendation, validateCurrentTiers } from './recommendations';
import { getProviderHealthSnapshot } from './provider-health';
import { emptyOnboardingState } from './types';

function readLegacyDefaultProvider(settings: Record<string, unknown>): string | null {
  const sero = settings.sero;
  if (!sero || typeof sero !== 'object' || Array.isArray(sero)) return null;
  const value = (sero as Record<string, unknown>).defaultProvider;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function hasSavedAuthJson(): boolean {
  const authPath = path.join(SERO_AGENT_DIR, 'auth.json');
  try {
    if (!existsSync(authPath)) return false;
    const content = readFileSync(authPath, 'utf8').trim();
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
      message: `We repaired unavailable saved model selections for ${invalidTiers.map(formatTierLabel).join(', ')}.`,
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

export async function getOnboardingState(): Promise<OnboardingState> {
  const activeProfile = profileManager.getActive();
  if (!activeProfile) {
    return emptyOnboardingState();
  }

  if (!activeProfile.onboarded) {
    const settings = readSettings();
    const currentTiers = getModelTiers(settings);
    const providerDefaults = resolveProviderDefaultsState(settings);
    const { availableModelGroups, providerHealth } = await getProviderHealthSnapshot();
    const hasAnyUsableModels = availableModelGroups.some((group) => group.models.length > 0);
    const brokenProviderIds = providerHealth
      .filter((provider) => provider.status === 'broken_expired' || provider.status === 'broken_invalid')
      .map((provider) => provider.providerId);

    const { recommendation, invalidTiers } = hasAnyUsableModels
      ? buildOnboardingRecommendation({
        availableModelGroups,
        currentTiers,
        providerHealth,
        providerDefaults,
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
      hasImportedCredentials: hasSavedAuthJson(),
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

  return emptyOnboardingState();
}
