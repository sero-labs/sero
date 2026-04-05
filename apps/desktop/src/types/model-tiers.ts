/** Model tier levels for user-configured defaults. */
export type ModelTier = 'LOW' | 'MED' | 'HIGH';

/** A user-configured model for a specific tier. */
export interface ModelTierEntry {
  provider: string;
  modelId: string;
}

/** Per-profile tier configuration stored in settings.json. */
export type ModelTierSettings = Partial<Record<ModelTier, ModelTierEntry>>;

/** Recommended model IDs per provider and tier. */
export type ProviderTierDefaults = Partial<Record<ModelTier, string>>;

/** Provider → recommended LOW/MED/HIGH models mapping. */
export type ProviderModelDefaults = Record<string, ProviderTierDefaults>;

export interface ResolvedProviderDefaultsState {
  builtInDefaults: ProviderModelDefaults;
  globalDefaults: ProviderModelDefaults;
  profileOverrides?: ProviderModelDefaults;
  effectiveDefaults: ProviderModelDefaults;
}
