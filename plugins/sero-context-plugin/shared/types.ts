/**
 * Shared state shape for the Context app.
 *
 * This is the single source of truth — the Pi extension writes snapshots
 * of the context graph after each operation, and the Sero web UI reads
 * and renders them via useAppState.
 */

// ── Context Graph Nodes ────────────────────────────────────────

export type NodeRole = 'user' | 'ai' | 'tool' | 'bash' | 'summary';

export interface ContextNode {
  id: string;
  role: NodeRole;
  content: string; // truncated preview (max ~120 chars)
  label?: string; // tag name (if tagged)
  isHead: boolean;
  isRoot: boolean;
  isBranchPoint: boolean;
  hiddenBefore: number; // count of hidden messages before this entry
}

// ── Context Usage ──────────────────────────────────────────────

export interface UsageBreakdown {
  system: number;
  toolDefs: number;
  messages: number;
  toolCalls: number;
  toolResults: number;
  other: number;
}

export interface ContextUsage {
  tokens: number;
  contextWindow: number;
  percent: number;
  breakdown: UsageBreakdown;
}

// ── Root State ─────────────────────────────────────────────────

export interface ContextState {
  nodes: ContextNode[];
  usage: ContextUsage | null;
  stepsSinceTag: number;
  nearestTag: string;
  totalEntries: number; // total branch length (including hidden)
  lastUpdated: string; // ISO timestamp
}

export const DEFAULT_CONTEXT_STATE: ContextState = {
  nodes: [],
  usage: null,
  stepsSinceTag: 0,
  nearestTag: 'None',
  totalEntries: 0,
  lastUpdated: '',
};
