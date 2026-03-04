/**
 * Subagent system types — shared across discovery, pool, runner, tracker, and tools.
 */

// ── Status & Mode ────────────────────────────────────────────

export type SubagentStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'aborted'
  | 'timed_out';

export type SubagentMode = 'single' | 'parallel' | 'chain';

// ── Agent Config (from .md discovery) ────────────────────────

export interface AgentConfig {
  /** Unique identifier (from frontmatter `name`). */
  name: string;
  /** What this agent does (from frontmatter `description`). */
  description: string;
  /** Default model for this agent. */
  model?: string;
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

// ── Subagent Entry (tracker state) ───────────────────────────

export interface SubagentUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  cost: number;
}

export interface SubagentEntry {
  /** Unique run ID. */
  id: string;
  /** Agent config name (or 'ad-hoc'). */
  agentName: string;
  /** First 200 chars of the task prompt. */
  taskPreview: string;
  /** Current status. */
  status: SubagentStatus;
  /** Unix ms when the run started. */
  startedAt: number;
  /** Unix ms when the run completed (or null if still running). */
  completedAt: number | null;
  /** Duration in milliseconds (or null if still running). */
  durationMs: number | null;
  /** Which main session spawned this. */
  parentSessionId: string;
  /** Workspace this run belongs to. */
  workspaceId: string;
  /** Execution mode. */
  mode: SubagentMode;
  /** Step index in chain mode. */
  chainStep?: number;
  /** Token and cost usage. */
  usage: SubagentUsage;
  /** Model used for this run. */
  model: string | null;
  /** Recent tool activity (last N tool calls). */
  toolActivity: SubagentToolActivity[];
  /** Live output text (streamed during execution). */
  liveOutput: string;
  /** First 500 chars of the response. */
  responsePreview?: string;
  /** Complete response text. */
  fullResponse?: string;
  /** Error message if failed. */
  error?: string;
}

// ── Tool Activity ────────────────────────────────────────────

export interface SubagentToolActivity {
  /** Tool name (e.g. 'read', 'bash', 'edit'). */
  toolName: string;
  /** Short summary of args (e.g. file path, command). */
  argsSummary: string;
  /** Whether this tool call is still running. */
  running: boolean;
}

// ── Settings ─────────────────────────────────────────────────

export interface SubagentSettings {
  /** Per-invocation fan-out cap. Default: 4. */
  maxConcurrent: number;
  /** Global active child session cap. Default: 8. */
  maxTotal: number;
  /** Default timeout in ms. Default: 600_000 (10 min). */
  timeoutMs: number;
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
  /** Concrete model ID to use. */
  model: string;
  /** Concrete thinking level. */
  thinking: string;
  /** Concrete timeout in milliseconds. */
  timeoutMs: number;
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
}

// ── Task Overrides (from tool params) ────────────────────────

export interface TaskOverride {
  model?: string;
  thinking?: string;
  timeoutMs?: number;
}
