/**
 * Config resolution — 5-level precedence chain for model, thinking, and timeout.
 *
 * Precedence (highest → lowest):
 *   1. Per-task override (tasks[i] / chain[i])
 *   2. Top-level call override
 *   3. Agent frontmatter
 *   4. Global subagent settings (settings.json)
 *   5. Session / app defaults
 */

import type {
  AgentConfig,
  SubagentSettings,
  ResolvedConfig,
  TaskOverride,
} from './types';

/** Defaults used as the absolute fallback. */
const HARDCODED_DEFAULTS = {
  model: 'claude-sonnet-4-5',
  thinking: 'high',
  timeoutMs: 600_000,
} as const;

export interface SessionDefaults {
  model?: string;
  thinking?: string;
}

/**
 * Resolve the concrete model, thinking, and timeoutMs for a subagent run.
 *
 * Each level only overrides if the value is non-null/non-undefined.
 * Falls back to hardcoded defaults as the last resort.
 */
export function resolveConfig(
  taskOverride?: TaskOverride,
  callOverride?: TaskOverride,
  agentConfig?: Pick<AgentConfig, 'model' | 'thinking' | 'timeoutMs'>,
  settings?: Pick<SubagentSettings, 'model' | 'thinking' | 'timeoutMs'>,
  sessionDefaults?: SessionDefaults,
): ResolvedConfig {
  const model = firstDefined(
    taskOverride?.model,
    callOverride?.model,
    agentConfig?.model,
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

  return { model, thinking, timeoutMs };
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
