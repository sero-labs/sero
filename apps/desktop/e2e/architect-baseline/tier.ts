/**
 * Resolves the global model tier the pilot runs on.
 *
 * The profile stores tier selections in `agent/settings.json` under
 * `sero.modelTiers`, with `defaultThinkingLevel` as the fallback effort, the same
 * as the app's own reader (`getGlobalModelConfigTiers`). The result is read
 * before the app starts because the Architect owner is pinned at launch, and it
 * is checked against the running app afterwards. Nothing falls back to another
 * model: a tier that does not resolve refuses the run.
 */

export type TierName = 'LOW' | 'MED';

export interface ResolvedTier {
  tier: TierName;
  provider: string;
  modelId: string;
  /** `provider/modelId`. */
  model: string;
  thinking: string;
}

/** Paid runs never go to this provider, whatever the tier says. */
const REFUSED_PROVIDER = 'anthropic';

export function tierFromEnv(value: string | undefined): TierName {
  const wanted = (value ?? 'low').trim().toLowerCase();
  if (wanted === 'low') return 'LOW';
  if (wanted === 'med') return 'MED';
  throw new Error(`SERO_BASELINE_TIER must be "low" or "med", not "${value ?? ''}".`);
}

export function resolveTier(settings: unknown, tier: TierName): ResolvedTier {
  const root = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>;
  const sero = (root.sero && typeof root.sero === 'object' ? root.sero : {}) as Record<string, unknown>;
  const tiers = (sero.modelTiers && typeof sero.modelTiers === 'object' ? sero.modelTiers : {}) as Record<string, unknown>;
  const entry = tiers[tier];
  const fields = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
  if (typeof fields.provider !== 'string' || typeof fields.modelId !== 'string' || !fields.provider || !fields.modelId) {
    throw new Error(`The ${tier} tier has no model selected in this profile. Select one in Admin, then run the pilot again.`);
  }
  if (fields.provider === REFUSED_PROVIDER) {
    throw new Error(`The ${tier} tier resolves to ${fields.provider}/${fields.modelId}. The pilot never runs on ${REFUSED_PROVIDER}. Pick another model for this tier in Admin.`);
  }
  const fallback = typeof root.defaultThinkingLevel === 'string' ? root.defaultThinkingLevel : 'high';
  const thinking = (typeof fields.thinkingLevel === 'string' ? fields.thinkingLevel : fallback).trim().toLowerCase();
  return { tier, provider: fields.provider, modelId: fields.modelId, model: `${fields.provider}/${fields.modelId}`, thinking };
}
