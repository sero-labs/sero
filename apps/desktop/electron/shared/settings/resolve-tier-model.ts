/**
 * Tier-aware model resolution.
 *
 * Resolves a structured model field (with `prefer` tier alias + `fallbacks`)
 * to a concrete available model. Used by the subagent resolver and adhoc agent.
 *
 * Resolution order:
 *   1. If `prefer` is a tier alias (LOW/MED/HIGH) → user's chosen model for that tier
 *   2. If `prefer` is a model ID → try that model directly
 *   3. Iterate `fallbacks` → use first available
 *   4. Return null → caller should prompt user to pick
 */

import type { ModelTier, ModelTierSettings } from '../../../src/types/ipc';
import { MODEL_TIERS } from './model-tiers';

/** The structured model field from agent frontmatter. */
export interface StructuredModelField {
  prefer: string;
  fallbacks: string[];
}

/** A model available in the registry (provider + id). */
export interface AvailableModel {
  provider: string;
  id: string;
}

/** Result of model resolution. */
export interface ResolvedModel {
  provider: string;
  modelId: string;
}

function isTierAlias(value: string): value is ModelTier {
  return MODEL_TIERS.includes(value as ModelTier);
}

function findModelById(
  available: AvailableModel[],
  modelId: string,
): AvailableModel | undefined {
  const lowerId = modelId.toLowerCase();
  return available.find((m) => m.id.toLowerCase() === lowerId);
}

/**
 * Parse a model field from agent frontmatter.
 *
 * Accepts either:
 * - A plain string (legacy): `"claude-sonnet-4-6"` → { prefer: "claude-sonnet-4-6", fallbacks: [] }
 * - A structured object: `{ prefer: "MED", fallbacks: ["gpt-5.4", ...] }`
 */
export function parseModelField(
  raw: unknown,
): StructuredModelField | null {
  if (typeof raw === 'string' && raw.trim()) {
    return { prefer: raw.trim(), fallbacks: [] };
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const prefer = typeof obj.prefer === 'string' ? obj.prefer.trim() : '';
    if (!prefer) return null;

    const fallbacks: string[] = [];
    if (Array.isArray(obj.fallbacks)) {
      for (const f of obj.fallbacks) {
        if (typeof f === 'string' && f.trim()) fallbacks.push(f.trim());
      }
    }
    return { prefer, fallbacks };
  }

  return null;
}

/**
 * Resolve a structured model field to a concrete available model.
 *
 * Returns null if no model could be resolved (caller should prompt user).
 */
export function resolveTierModel(
  field: StructuredModelField,
  tierSettings: ModelTierSettings,
  available: AvailableModel[],
): ResolvedModel | null {
  if (available.length === 0) return null;

  // 1. Resolve `prefer`
  if (isTierAlias(field.prefer)) {
    const tierEntry = tierSettings[field.prefer];
    if (tierEntry) {
      const match = available.find(
        (m) => m.provider === tierEntry.provider && m.id === tierEntry.modelId,
      );
      if (match) return { provider: match.provider, modelId: match.id };
    }
  } else {
    // Treat as a model ID
    const match = findModelById(available, field.prefer);
    if (match) return { provider: match.provider, modelId: match.id };
  }

  // 2. Walk fallbacks
  for (const fallback of field.fallbacks) {
    const match = findModelById(available, fallback);
    if (match) return { provider: match.provider, modelId: match.id };
  }

  return null;
}
