import type { ThinkingLevel } from '@mariozechner/pi-agent-core';
import type { ModelValidationWarning } from '@sero/common';

/** Model tier levels for user-configured defaults. */
export type ModelTier = 'LOW' | 'MED' | 'HIGH';

/** A user-configured model for a specific tier. */
export interface ModelTierEntry {
  provider: string;
  modelId: string;
  thinkingLevel?: ThinkingLevel;
}

/** Per-profile tier configuration stored in settings.json. */
export type ModelTierSettings = Partial<Record<ModelTier, ModelTierEntry>>;

export interface GlobalModelConfigInput {
  tiers: ModelTierSettings;
}

export interface GlobalModelConfigState extends GlobalModelConfigInput {
  warnings: ModelValidationWarning[];
  migrationNotice?: string;
}
