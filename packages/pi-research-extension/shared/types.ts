/**
 * Shared state types for the Research Orchestrator.
 *
 * Both the Pi extension and the Sero web UI read/write JSON files
 * matching these shapes. The extension writes; the UI reads via useAppState.
 */

// ── Agent workstream ────────────────────────────────────────

export type AgentStatus = 'pending' | 'running' | 'stuck' | 'complete' | 'failed';

export interface ResearchSection {
  title: string;
  completed: boolean;
}

export interface ResearchAgent {
  /** Agent index (1-based). */
  id: number;
  /** Agent name/label (e.g. "Decision Science & Optimal Stopping"). */
  name: string;
  /** Sections this agent will research. */
  sections: ResearchSection[];
  /** Current status. */
  status: AgentStatus;
  /** Relative path to the agent's output file. */
  outputFile: string;
  /** Line count of the output file (for progress monitoring). */
  lineCount: number;
  /** Number of monitoring check-ins where lineCount was unchanged. */
  stuckChecks: number;
  /** Error message if failed. */
  error?: string;
  /** ISO timestamp when started. */
  startedAt?: string;
  /** ISO timestamp when completed. */
  completedAt?: string;
}

// ── Session mode ────────────────────────────────────────────

/** 'research' = standard multi-agent research; 'article' = article analysis */
export type SessionMode = 'research' | 'article';

// ── Research session ────────────────────────────────────────

export type ResearchPhase =
  | 'idle'
  | 'planning'
  | 'awaiting_approval'
  | 'researching'
  | 'synthesizing'
  | 'complete'
  | 'failed';

export interface ResearchSession {
  /** Session mode — standard research or article analysis. */
  mode: SessionMode;
  /** Original research question. */
  question: string;
  /** Current phase. */
  phase: ResearchPhase;
  /** Research agents (workstreams). */
  agents: ResearchAgent[];
  /** Relative path to the synthesis output file. */
  synthesisFile?: string;
  /** Output directory (relative to workspace). */
  outputDir: string;
  /** ISO timestamp when the session started. */
  startedAt: string;
  /** ISO timestamp when the session completed. */
  completedAt?: string;
  /** Error message if failed. */
  error?: string;
  /** Number of monitoring cycles completed. */
  monitorCycles: number;
  /** Article URLs to analyse (article mode only). */
  articleUrls?: string[];
  /** User context: what they're building / looking for (article mode only). */
  userContext?: string;
}

// ── Top-level state ─────────────────────────────────────────

export interface ResearchState {
  /** Current active research session (null if none). */
  current: ResearchSession | null;
  /** Completed research sessions (most recent first). */
  history: ResearchHistoryEntry[];
}

export interface ResearchHistoryEntry {
  question: string;
  /** Session mode. Defaults to 'research' for legacy entries. */
  mode?: SessionMode;
  outputDir: string;
  agentCount: number;
  completedAt: string;
}

export const DEFAULT_STATE: ResearchState = {
  current: null,
  history: [],
};
