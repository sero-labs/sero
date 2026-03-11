/**
 * Typed config layer — parses workflow YAML into SymphonyConfig.
 *
 * Applies defaults (Section 6.4), resolves $VAR environment variables,
 * expands ~ for paths, coerces types, and validates preflight checks.
 */

import os from 'node:os';
import type {
  SymphonyConfig,
  TrackerConfig,
  PollingConfig,
  WorkspaceConfig,
  HooksConfig,
  AgentConfig,
  SessionConfig,
} from '../shared/types';
import {
  DEFAULT_POLLING,
  DEFAULT_WORKSPACE,
  DEFAULT_HOOKS,
  DEFAULT_AGENT,
  DEFAULT_SESSION,
} from '../shared/types';

// ── Environment variable resolution ────────────────────────────

function resolveEnvVars(value: string): string {
  return value.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_match, varName: string) => {
    return process.env[varName] ?? '';
  });
}

function expandTilde(value: string): string {
  if (value.startsWith('~/')) {
    return os.homedir() + value.slice(1);
  }
  return value;
}

function resolveString(value: unknown): string {
  if (typeof value !== 'string') return String(value ?? '');
  return expandTilde(resolveEnvVars(value));
}

// ── Type coercion helpers ──────────────────────────────────────

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = parseInt(value, 10);
    return isNaN(n) ? fallback : n;
  }
  return fallback;
}

function toStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return fallback;
}

// ── Config section parsers ─────────────────────────────────────

function parseTracker(raw: Record<string, unknown> | undefined): TrackerConfig {
  if (!raw || typeof raw !== 'object') {
    throw new ConfigError('tracker section is required in WORKFLOW.md front matter');
  }

  const kind = String(raw.kind ?? 'linear');

  if (kind === 'file') {
    return {
      kind: 'file',
      issues_dir: resolveString(raw.issues_dir ?? '~/symphony-issues'),
      active_states: toStringArray(raw.active_states, ['active']),
      terminal_states: toStringArray(raw.terminal_states, ['done', 'failed']),
    };
  }

  return {
    kind: 'linear',
    api_key: resolveString(raw.api_key ?? '$LINEAR_API_KEY'),
    project_slug: resolveString(raw.project_slug ?? ''),
    active_states: toStringArray(raw.active_states, ['Todo', 'In Progress']),
    terminal_states: toStringArray(raw.terminal_states, ['Done', 'Canceled']),
  };
}

function parsePolling(raw: Record<string, unknown> | undefined): PollingConfig {
  if (!raw) return { ...DEFAULT_POLLING };
  return {
    interval_ms: toNumber(raw.interval_ms, DEFAULT_POLLING.interval_ms),
    stall_timeout_ms: toNumber(raw.stall_timeout_ms, DEFAULT_POLLING.stall_timeout_ms),
  };
}

function parseWorkspace(raw: Record<string, unknown> | undefined): WorkspaceConfig {
  if (!raw) return { ...DEFAULT_WORKSPACE, root: expandTilde(DEFAULT_WORKSPACE.root) };
  return {
    root: resolveString(raw.root ?? DEFAULT_WORKSPACE.root),
  };
}

function parseHooks(raw: Record<string, unknown> | undefined): HooksConfig {
  if (!raw) return { ...DEFAULT_HOOKS };
  return {
    after_clone: raw.after_clone ? resolveString(raw.after_clone) : null,
    before_remove: raw.before_remove ? resolveString(raw.before_remove) : null,
    timeout_ms: toNumber(raw.timeout_ms, DEFAULT_HOOKS.timeout_ms),
  };
}

function parseAgent(raw: Record<string, unknown> | undefined): AgentConfig {
  if (!raw) return { ...DEFAULT_AGENT };
  return {
    max_concurrent: toNumber(raw.max_concurrent, DEFAULT_AGENT.max_concurrent),
    max_retries: toNumber(raw.max_retries, DEFAULT_AGENT.max_retries),
    max_retry_backoff_ms: toNumber(raw.max_retry_backoff_ms, DEFAULT_AGENT.max_retry_backoff_ms),
  };
}

function parseSession(raw: Record<string, unknown> | undefined): SessionConfig {
  if (!raw) return { ...DEFAULT_SESSION };
  return {
    turn_timeout_ms: toNumber(raw.turn_timeout_ms, DEFAULT_SESSION.turn_timeout_ms),
    max_turns: toNumber(raw.max_turns, DEFAULT_SESSION.max_turns),
    model: typeof raw.model === 'string' ? raw.model : DEFAULT_SESSION.model,
    thinking_level: typeof raw.thinking_level === 'string' ? raw.thinking_level : DEFAULT_SESSION.thinking_level,
  };
}

// ── Error type ─────────────────────────────────────────────────

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

// ── Public API ─────────────────────────────────────────────────

export function parseConfig(workflowConfig: Record<string, unknown>): SymphonyConfig {
  const tracker = parseTracker(workflowConfig.tracker as Record<string, unknown> | undefined);
  const polling = parsePolling(workflowConfig.polling as Record<string, unknown> | undefined);
  const workspace = parseWorkspace(workflowConfig.workspace as Record<string, unknown> | undefined);
  const hooks = parseHooks(workflowConfig.hooks as Record<string, unknown> | undefined);
  const agent = parseAgent(workflowConfig.agent as Record<string, unknown> | undefined);
  const session = parseSession(workflowConfig.session as Record<string, unknown> | undefined);

  return { tracker, polling, workspace, hooks, agent, session };
}

export function validateConfig(config: SymphonyConfig): string[] {
  const errors: string[] = [];

  if (config.tracker.kind === 'linear') {
    if (!config.tracker.api_key) errors.push('tracker.api_key is required for Linear');
    if (!config.tracker.project_slug) errors.push('tracker.project_slug is required for Linear');
  } else {
    if (!config.tracker.issues_dir) errors.push('tracker.issues_dir is required for file tracker');
  }

  if (config.polling.interval_ms < 1000) {
    errors.push('polling.interval_ms must be >= 1000');
  }

  if (config.agent.max_concurrent < 1) {
    errors.push('agent.max_concurrent must be >= 1');
  }

  if (config.session.max_turns < 1) {
    errors.push('session.max_turns must be >= 1');
  }

  return errors;
}
