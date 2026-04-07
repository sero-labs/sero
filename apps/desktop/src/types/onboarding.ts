import type { AvailableModelGroup } from './agent';
import type { ModelTier, ModelTierSettings } from './model-tiers';

export type ProviderHealthStatus =
  | 'healthy'
  | 'broken_expired'
  | 'broken_invalid'
  | 'env'
  | 'local'
  | 'missing'
  | 'unknown';

export interface ProviderHealthInfo {
  providerId: string;
  displayName: string;
  status: ProviderHealthStatus;
  message?: string;
  canReconnect: boolean;
  hasUsableModels: boolean;
  usableModelIds: string[];
}

export type OnboardingStatePhase = 'ready' | 'auth' | 'error' | 'done';

export type OnboardingTierSource =
  | 'preserved'
  | 'imported'
  | 'provider-defaults'
  | 'fallback';

export interface OnboardingRecommendation {
  tiers: ModelTierSettings;
  sourcesByTier: Partial<Record<ModelTier, OnboardingTierSource>>;
  preferredProvider?: string;
}

export interface OnboardingWarning {
  code:
    | 'broken_imported_providers'
    | 'invalid_existing_tiers'
    | 'no_usable_models'
    | 'provider_recommendation_changed';
  message: string;
  providerIds?: string[];
}

export interface OnboardingState {
  needed: boolean;
  phase: OnboardingStatePhase;
  hasAnyUsableModels: boolean;
  hasImportedCredentials: boolean;
  /** True once the memory plugin has written MEMORY.md for this profile. */
  memoryBootstrapComplete: boolean;
  recommendation: OnboardingRecommendation | null;
  providerHealth: ProviderHealthInfo[];
  availableModelGroups: AvailableModelGroup[];
  warnings: OnboardingWarning[];
  invalidTiers: ModelTier[];
}
