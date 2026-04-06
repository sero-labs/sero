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
 * or a structured `{ prefer, fallbacks }` object. The merged winner is
 * returned in `ResolvedConfig.modelSelection`, while `ResolvedConfig.model`
 * exposes the primary display/reference string (`prefer` for structured
 * fields). Tier resolution still happens downstream in the runner where the
 * model registry is available.
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

function firstDefinedModel(
  ...values: (string | { prefer: string; fallbacks: string[] } | null | undefined)[]
): string | { prefer: string; fallbacks: string[] } {
  for (const v of values) {
    if (typeof v === 'string' && v !== '') return v;
    if (v && typeof v === 'object') return v;
  }
  return HARDCODED_DEFAULTS.model;
}

/**
 * Resolve the concrete model, thinking, and timeoutMs for a subagent run.
 *
 * Each level only overrides if the value is non-null/non-undefined.
 * Falls back to hardcoded defaults as the last resort.
 *
 * NOTE: The returned `model` may be a tier alias (e.g. "MED") when it
 * originates from overrides, agent frontmatter, or hardcoded defaults. The
 * runner is responsible for resolving aliases/fallbacks to a concrete model.
 */
export function resolveConfig(
  taskOverride?: TaskOverride,
  callOverride?: TaskOverride,
  agentConfig?: Pick<AgentConfig, 'model' | 'thinking' | 'timeoutMs'>,
  settings?: Pick<SubagentSettings, 'model' | 'thinking' | 'timeoutMs' | 'toolStallTimeoutMs'>,
  sessionDefaults?: SessionDefaults,
): ResolvedConfig {
  const modelSelection = firstDefinedModel(
    taskOverride?.model,
    callOverride?.model,
    agentConfig?.model,
    settings?.model,
    sessionDefaults?.model,
    HARDCODED_DEFAULTS.model,
  );
  const model = extractModelString(modelSelection) ?? HARDCODED_DEFAULTS.model;

  const thinking = resolveThinking(taskOverride, callOverride, agentConfig, settings, sessionDefaults);

  const timeoutMs = firstDefinedNumber(
    taskOverride?.timeoutMs,
    callOverride?.timeoutMs,
    agentConfig?.timeoutMs,
    settings?.timeoutMs,
    HARDCODED_DEFAULTS.timeoutMs,
  );

  const toolStallTimeoutMs = settings?.toolStallTimeoutMs ?? HARDCODED_DEFAULTS.toolStallTimeoutMs;

  return {
    model,
    modelSelection,
    thinking: thinking.value,
    thinkingSource: thinking.source,
    timeoutMs,
    toolStallTimeoutMs,
  };
}

function resolveThinking(
  taskOverride?: Pick<TaskOverride, 'thinking'>,
  callOverride?: Pick<TaskOverride, 'thinking'>,
  agentConfig?: Pick<AgentConfig, 'thinking'>,
  settings?: Pick<SubagentSettings, 'thinking'>,
  sessionDefaults?: SessionDefaults,
): { value: string; source: ResolvedConfig['thinkingSource'] } {
  if (taskOverride?.thinking) return { value: taskOverride.thinking, source: 'task' };
  if (callOverride?.thinking) return { value: callOverride.thinking, source: 'call' };
  if (agentConfig?.thinking) return { value: agentConfig.thinking, source: 'agent' };
  if (settings?.thinking) return { value: settings.thinking, source: 'settings' };
  if (sessionDefaults?.thinking) return { value: sessionDefaults.thinking, source: 'session' };
  return { value: HARDCODED_DEFAULTS.thinking, source: 'default' };
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
