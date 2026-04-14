/**
 * Shared model-selection contracts used across desktop and plugin UIs.
 *
 * Keep this file renderer-safe and framework-agnostic.
 */

import type { ThinkingLevel } from '@mariozechner/pi-agent-core';

export type { ThinkingLevel };

export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const satisfies readonly ThinkingLevel[];

export const THINKING_LABELS: Record<ThinkingLevel, string> = {
  off: 'Off',
  minimal: 'Min',
  low: 'Low',
  medium: 'Med',
  high: 'High',
  xhigh: 'Max',
};

export const MODEL_TIERS = ['LOW', 'MED', 'HIGH'] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

export interface SharedModelInfo {
  provider: string;
  modelId: string;
  name: string;
  reasoning: boolean;
  availableThinkingLevels?: string[];
  supportsXhigh?: boolean;
}

export interface SharedAvailableModelGroup<TModel extends SharedModelInfo = SharedModelInfo> {
  provider: string;
  displayName: string;
  logo: string;
  models: TModel[];
}

export interface SharedModelTierEntry {
  provider: string;
  modelId: string;
  thinkingLevel?: ThinkingLevel;
}

export type SharedModelTierSettings = Partial<Record<ModelTier, SharedModelTierEntry>>;

export interface StructuredModelPreference {
  prefer: string;
  fallbacks?: string[];
}

export type AgentModelPreference = string | StructuredModelPreference;

export type ModelValidationWarningCode =
  | 'missing_global_tier'
  | 'unsupported_tier_thinking'
  | 'missing_agent_model'
  | 'missing_agent_tier'
  | 'agent_fallback_only';

export type ModelValidationWarning =
  | {
      code: 'missing_global_tier';
      severity: 'warning';
      tier: ModelTier;
      provider: string;
      modelId: string;
    }
  | {
      code: 'unsupported_tier_thinking';
      severity: 'warning';
      tier: ModelTier;
      modelName: string;
      requestedThinkingLevel: ThinkingLevel;
      maxSupportedThinkingLevel: ThinkingLevel;
    }
  | {
      code: 'missing_agent_model';
      severity: 'warning';
      preferredLabel: string;
      preferenceKind: 'direct' | 'preferred';
      allFallbacksUnavailable?: boolean;
    }
  | {
      code: 'missing_agent_tier';
      severity: 'warning';
      tier: ModelTier;
      allFallbacksUnavailable?: boolean;
    }
  | {
      code: 'agent_fallback_only';
      severity: 'info';
      preferredLabel: string;
      fallbackLabel: string;
    };
