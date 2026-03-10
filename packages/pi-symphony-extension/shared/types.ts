/**
 * Shared state shape for the Symphony app.
 *
 * This is the single source of truth — both the Pi extension and the
 * Sero web UI read/write a JSON file matching this shape.
 */

// ── Issue model (Section 4.1.1) ─────────────────────────────────

export interface BlockerRef {
  id: string | null;
  identifier: string | null;
  state: string | null;
}

export interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: string;
  branchName: string | null;
  url: string | null;
  labels: string[];
  blockedBy: BlockerRef[];
  createdAt: string | null;
  updatedAt: string | null;
}

// ── Workflow definition (Section 4.1.2) ─────────────────────────

export interface WorkflowDefinition {
  config: Record<string, unknown>;
  promptTemplate: string;
}

// ── Run phases (Section 7.2) ────────────────────────────────────

export type RunPhase =
  | 'preparing_workspace'
  | 'building_prompt'
  | 'launching_agent'
  | 'initializing_session'
  | 'streaming_turn'
  | 'finishing'
  | 'succeeded'
  | 'failed'
  | 'timed_out'
  | 'stalled'
  | 'canceled_by_reconciliation';

// ── Running entry (Section 4.1.8) ──────────────────────────────

export interface RunningEntry {
  issueId: string;
  identifier: string;
  issue: Issue;
  sessionId: string | null;
  codexAppServerPid: string | null;
  lastCodexMessage: string | null;
  lastCodexEvent: string | null;
  lastCodexTimestamp: string | null;
  codexInputTokens: number;
  codexOutputTokens: number;
  codexTotalTokens: number;
  lastReportedInputTokens: number;
  lastReportedOutputTokens: number;
  lastReportedTotalTokens: number;
  turnCount: number;
  retryAttempt: number | null;
  startedAt: string;
  phase: RunPhase;
}

// ── Retry entry (Section 4.1.7) ────────────────────────────────

export interface RetryEntry {
  issueId: string;
  identifier: string;
  attempt: number;
  dueAtMs: number;
  error: string | null;
}

// ── Token totals ────────────────────────────────────────────────

export interface CodexTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  secondsRunning: number;
}

// ── Orchestrator runtime state (Section 4.1.8) ─────────────────

export interface SymphonyState {
  serviceActive: boolean;
  workflowPath: string | null;
  workflowValid: boolean;
  workflowError: string | null;
  pollIntervalMs: number;
  maxConcurrentAgents: number;
  running: RunningEntry[];
  retrying: RetryEntry[];
  completed: string[];
  codexTotals: CodexTotals;
  rateLimits: Record<string, unknown> | null;
  lastPollAt: string | null;
  lastError: string | null;
  trackerKind: 'linear' | 'file' | null;
  trackerLabel: string | null;
}

export const DEFAULT_SYMPHONY_STATE: SymphonyState = {
  serviceActive: false,
  workflowPath: null,
  workflowValid: false,
  workflowError: null,
  pollIntervalMs: 30_000,
  maxConcurrentAgents: 2,
  running: [],
  retrying: [],
  completed: [],
  codexTotals: {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    secondsRunning: 0,
  },
  rateLimits: null,
  lastPollAt: null,
  lastError: null,
  trackerKind: null,
  trackerLabel: null,
};

// ── Config types (Section 5.3) ──────────────────────────────────

export type TrackerConfig =
  | {
      kind: 'linear';
      api_key: string;
      project_slug: string;
      active_states: string[];
      terminal_states: string[];
    }
  | {
      kind: 'file';
      issues_dir: string;
      active_states: string[];
      terminal_states: string[];
    };

export interface PollingConfig {
  interval_ms: number;
  stall_timeout_ms: number;
}

export interface WorkspaceConfig {
  root: string;
}

export interface HooksConfig {
  after_clone: string | null;
  before_remove: string | null;
  timeout_ms: number;
}

export interface AgentConfig {
  max_concurrent: number;
  max_retries: number;
  max_retry_backoff_ms: number;
}

export interface CodexConfig {
  command: string;
  read_timeout_ms: number;
  turn_timeout_ms: number;
  max_turns: number;
}

export interface SymphonyConfig {
  tracker: TrackerConfig;
  polling: PollingConfig;
  workspace: WorkspaceConfig;
  hooks: HooksConfig;
  agent: AgentConfig;
  codex: CodexConfig;
}

// ── Config defaults (Section 6.4) ──────────────────────────────

export const DEFAULT_POLLING: PollingConfig = {
  interval_ms: 30_000,
  stall_timeout_ms: 300_000,
};

export const DEFAULT_WORKSPACE: WorkspaceConfig = {
  root: '~/.sero-ui/symphony/workspaces',
};

export const DEFAULT_HOOKS: HooksConfig = {
  after_clone: null,
  before_remove: null,
  timeout_ms: 60_000,
};

export const DEFAULT_AGENT: AgentConfig = {
  max_concurrent: 2,
  max_retries: 3,
  max_retry_backoff_ms: 320_000,
};

export const DEFAULT_CODEX: CodexConfig = {
  command: 'codex',
  read_timeout_ms: 120_000,
  turn_timeout_ms: 600_000,
  max_turns: 10,
};

// ── Helper: create a new RunningEntry ──────────────────────────

export function createRunningEntry(issue: Issue, attempt: number | null): RunningEntry {
  return {
    issueId: issue.id,
    identifier: issue.identifier,
    issue,
    sessionId: null,
    codexAppServerPid: null,
    lastCodexMessage: null,
    lastCodexEvent: null,
    lastCodexTimestamp: null,
    codexInputTokens: 0,
    codexOutputTokens: 0,
    codexTotalTokens: 0,
    lastReportedInputTokens: 0,
    lastReportedOutputTokens: 0,
    lastReportedTotalTokens: 0,
    turnCount: 0,
    retryAttempt: attempt,
    startedAt: new Date().toISOString(),
    phase: 'preparing_workspace',
  };
}
