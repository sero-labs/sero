/**
 * Config resolution — 5-level precedence chain for model, thinking, and timeout.
 *
 * Precedence (highest -> lowest):
 *   1. Per-task override (tasks[i] / chain[i])
 *   2. Top-level call override
 *   3. Agent frontmatter
 *   4. Global subagent settings (settings.json)
 *   5. Session / app defaults
 *
 * The `model` field from agent frontmatter may be a plain string (legacy)
 * or a structured `{ prefer, fallbacks }` object. When structured, the
 * `prefer` value is emitted as the model string — tier resolution happens
 * downstream in the runner where the model registry is available.
 */

import type {
  AgentConfig,
  SubagentSettings,
  ResolvedConfig,
  TaskOverride,
} from './types';

/**
 * Provider-neutral defaults used as the absolute fallback.
 * Uses MED tier alias — resolved to a concrete model at runtime.
 */
const HARDCODED_DEFAULTS = {
  model: 'MED',
  thinking: 'high',
  timeoutMs: 600_000,
  toolStallTimeoutMs: 120_000,
} as const;

export interface SessionDefaults {
  model?: string;
  thinking?: string;
}

/**
 * Extract the primary model string from an AgentConfig.model value.
 * Structured fields emit the `prefer` value; plain strings pass through.
 */
function extractModelString(
  model: string | { prefer: string; fallbacks: string[] } | undefined,
): string | undefined {
  if (typeof model === 'string') return model || undefined;
  if (model && typeof model === 'object') return model.prefer || undefined;
  return undefined;
}

/**
 * Resolve the concrete model, thinking, and timeoutMs for a subagent run.
 *
 * Each level only overrides if the value is non-null/non-undefined.
 * Falls back to hardcoded defaults as the last resort.
 *
 * NOTE: The returned `model` may be a tier alias (e.g. "MED") when it
 * originates from agent frontmatter or hardcoded defaults. The runner
 * is responsible for resolving tier aliases to concrete model IDs.
 */
export function resolveConfig(
  taskOverride?: TaskOverride,
  callOverride?: TaskOverride,
  agentConfig?: Pick<AgentConfig, 'model' | 'thinking' | 'timeoutMs'>,
  settings?: Pick<SubagentSettings, 'model' | 'thinking' | 'timeoutMs' | 'toolStallTimeoutMs'>,
  sessionDefaults?: SessionDefaults,
): ResolvedConfig {
  const model = firstDefined(
    taskOverride?.model,
    callOverride?.model,
    extractModelString(agentConfig?.model),
    settings?.model,
    sessionDefaults?.model,
    HARDCODED_DEFAULTS.model,
  );

  const thinking = firstDefined(
    taskOverride?.thinking,
    callOverride?.thinking,
    agentConfig?.thinking,
    settings?.thinking,
    sessionDefaults?.thinking,
    HARDCODED_DEFAULTS.thinking,
  );

  const timeoutMs = firstDefinedNumber(
    taskOverride?.timeoutMs,
    callOverride?.timeoutMs,
    agentConfig?.timeoutMs,
    settings?.timeoutMs,
    HARDCODED_DEFAULTS.timeoutMs,
  );

  const toolStallTimeoutMs = settings?.toolStallTimeoutMs ?? HARDCODED_DEFAULTS.toolStallTimeoutMs;

  return { model, thinking, timeoutMs, toolStallTimeoutMs };
}

/**
 * Return the first non-null, non-undefined string value.
 */
function firstDefined(...values: (string | null | undefined)[]): string {
  for (const v of values) {
    if (v !== null && v !== undefined && v !== '') return v;
  }
  return '';
}

/**
 * Return the first non-null, non-undefined number value.
 */
function firstDefinedNumber(...values: (number | null | undefined)[]): number {
  for (const v of values) {
    if (v !== null && v !== undefined) return v;
  }
  return HARDCODED_DEFAULTS.timeoutMs;
}
