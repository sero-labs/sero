/**
 * Subagent system types — shared across discovery, pool, runner, tracker, and tools.
 *
 * IPC-crossing types (SubagentStatus, SubagentMode, SubagentUsage, SubagentEntry,
 * SubagentToolActivity) are defined once in src/types/subagent.ts and re-exported
 * here. Main-process-only types (AgentConfig, RunnerConfig, etc.) are defined below.
 */

import type { ToolDefinition } from '@mariozechner/pi-coding-agent';

// Import IPC-shared types for local use
import type {
  SubagentMode as _SubagentMode,
  SubagentUsage as _SubagentUsage,
  SubagentModelConfig as _SubagentModelConfig,
} from '../../../../src/types/subagent';

// Re-export IPC-shared types as the single source of truth
export type {
  SubagentStatus,
  SubagentMode,
  SubagentUsage,
  SubagentEntry,
  SubagentToolActivity,
} from '../../../../src/types/subagent';

// Local aliases for use within this file
type SubagentUsage = _SubagentUsage;
type SubagentMode = _SubagentMode;
type SubagentModelConfig = _SubagentModelConfig;

// ── Agent Config (from .md discovery) ────────────────────────

export interface AgentConfig {
  /** Unique identifier (from frontmatter `name`). */
  name: string;
  /** What this agent does (from frontmatter `description`). */
  description: string;
  /** Default model — plain string (legacy) or structured { prefer, fallbacks }. */
  model?: SubagentModelConfig;
  /** Default thinking level. */
  thinking?: string;
  /** Default timeout in milliseconds. */
  timeoutMs?: number;
  /** Parsed tool names (stored, not enforced in v1). */
  tools?: string[];
  /** Parsed extension names (stored, not enforced in v1). */
  extensions?: string[];
  /** .md body content — the agent's system prompt. */
  systemPrompt: string;
  /** Always 'global' in v1 (global user agent directory). */
  source: 'global';
  /** Absolute path to the .md file. */
  filePath: string;
}

// ── Settings ─────────────────────────────────────────────────

export interface SubagentSettings {
  /** Per-invocation fan-out cap. Default: 4. */
  maxConcurrent: number;
  /** Global active child session cap. Default: 8. */
  maxTotal: number;
  /** Default timeout in ms. Default: 600_000 (10 min). */
  timeoutMs: number;
  /**
   * Per-tool stall timeout in ms. If a single tool call (especially bash)
   * runs longer than this without completing, the subagent is auto-aborted.
   * Default: 120_000 (2 min). Set to 0 to disable.
   */
  toolStallTimeoutMs: number;
  /** Default model if agent/call omit one. */
  model: string | null;
  /** Default thinking level if agent/call omit one. */
  thinking: string | null;
  /** Extension package names blocked from child sessions. */
  blockedExtensions: string[];
}

export const DEFAULT_SUBAGENT_SETTINGS: SubagentSettings = {
  maxConcurrent: 4,
  maxTotal: 8,
  timeoutMs: 600_000,
  toolStallTimeoutMs: 120_000,
  model: null,
  thinking: null,
  blockedExtensions: [],
};

// ── Run Result (runner output) ───────────────────────────────

export interface RunResult {
  /** Full response text from the subagent. */
  response: string;
  /** Token and cost usage. */
  usage: SubagentUsage;
  /** Error message if the run failed. */
  error?: string;
}

// ── Resolved Config (merged precedence output) ───────────────

export interface ResolvedConfig {
  /** Primary model reference for UI/tracking (model ID or tier alias). */
  model: string;
  /**
   * The merged winning model config after precedence resolution.
   * Preserves structured `{ prefer, fallbacks }` fields so the runner can
   * resolve the correct concrete model without re-reading agent frontmatter.
   */
  modelSelection: SubagentModelConfig;
  /** Concrete thinking level. */
  thinking: string;
  /** Concrete timeout in milliseconds. */
  timeoutMs: number;
  /** Per-tool stall timeout in milliseconds. 0 = disabled. */
  toolStallTimeoutMs: number;
}

// ── Runner Config (full config for a single run) ─────────────

export interface RunnerConfig {
  /** The agent configuration (from discovery or inline). */
  agent: AgentConfig;
  /** The task prompt to send. */
  task: string;
  /** Resolved model/thinking/timeout. */
  resolved: ResolvedConfig;
  /** Workspace ID for container access. */
  workspaceId: string;
  /** Parent session ID for tracking. */
  parentSessionId: string;
  /** Execution mode. */
  mode: SubagentMode;
  /** Chain step index (if chain mode). */
  chainStep?: number;
  /** Override the working directory (e.g. for git worktree execution). */
  cwdOverride?: string;
  /** Restrict to current workspace only — no cross-workspace mounts. */
  isolated?: boolean;
  /** AbortController signal. */
  signal: AbortSignal;
  /** Progress callback. */
  onProgress?: (usage: Partial<SubagentUsage>) => void;
  /** Tool activity callback (tool start/end). */
  onToolActivity?: (toolName: string, argsSummary: string, running: boolean) => void;
  /** Live text output callback (text deltas). */
  onTextDelta?: (delta: string) => void;
  /** Chat-level update callback (status lines). */
  onUpdate?: (text: string) => void;
  /** Extra run-scoped tools to expose to the subagent session. */
  customTools?: ToolDefinition[];
}

// ── Task Overrides (from tool params) ────────────────────────

export interface TaskOverride {
  model?: string;
  thinking?: string;
  timeoutMs?: number;
}
