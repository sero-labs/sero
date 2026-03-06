/**
 * Shared state shape for the Kanban dev app.
 *
 * Single source of truth — both the Pi extension and the
 * Sero web UI read/write a JSON file matching this shape.
 */

export type Column = 'backlog' | 'planning' | 'in-progress' | 'review' | 'done';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type CardStatus = 'idle' | 'agent-working' | 'waiting-input' | 'paused' | 'failed';

export interface Subtask {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  dependsOn: string[]; // IDs of subtasks that must complete first
  agentRunId?: string; // Subagent entry ID (for progress tracking)
  checkpointId?: string; // VCS checkpoint after completion
}

export interface PlanningToolEntry {
  tool: string;     // e.g. 'read', 'bash', 'grep'
  args: string;     // Short summary of args
  running: boolean; // Still active?
}

export interface PlanningProgress {
  phase: string;               // e.g. 'Analysing codebase', 'Generating plan'
  startedAt: number;           // Epoch ms
  agents: { name: string; status: 'running' | 'completed' | 'failed' }[];
  recentTools: PlanningToolEntry[];  // Last ~15 tool calls
  log: string[];               // Recent onUpdate lines (last ~20)
}

export interface ImplementationProgress {
  phase: string;               // e.g. 'Wave 2/4'
  startedAt: number;           // Epoch ms
  currentWave: number;         // Current wave index (1-based)
  totalWaves: number;          // Total number of execution waves
  agents: { name: string; status: 'running' | 'completed' | 'failed' }[];
  recentTools: PlanningToolEntry[];  // Last ~15 tool calls
  log: string[];               // Recent onUpdate lines (last ~20)
}

export interface ReviewProgress {
  phase: string;               // e.g. 'Reviewing diff', 'Pushing branch', 'Creating PR'
  startedAt: number;           // Epoch ms
  agents: { name: string; status: 'running' | 'completed' | 'failed' }[];
  recentTools: PlanningToolEntry[];  // Last ~15 tool calls
  log: string[];               // Recent onUpdate lines (last ~20)
}

export interface Card {
  id: string;
  title: string;
  description: string;
  acceptance: string[]; // Acceptance criteria checklist
  priority: Priority;
  column: Column;
  status: CardStatus;
  branch?: string; // Git branch name
  worktreePath?: string; // Absolute path to git worktree for this card
  sessionId?: string; // Sero session driving work
  subtasks: Subtask[];
  plan?: string; // Planning agent's proposed approach
  prUrl?: string; // Pull request URL
  prNumber?: number;
  reviewFilePath?: string; // Cached review JSON (avoids re-running expensive reviewer)
  lastCheckpoint?: string; // Latest VCS checkpoint ID
  planningProgress?: PlanningProgress; // Live progress during planning phase
  implementationProgress?: ImplementationProgress; // Live progress during implementation phase
  reviewProgress?: ReviewProgress; // Live progress during review phase
  error?: string; // Last error message
  createdAt: string; // ISO
  updatedAt: string; // ISO
  completedAt?: string; // ISO
}

export interface KanbanSettings {
  autoAdvance: boolean; // Auto-move cards through stages
  maxConcurrentCards: number; // How many cards can be In Progress at once
  requireApproval: {
    plan: boolean; // Pause after planning for approval
    pr: boolean; // Pause before creating PR
  };
}

export interface KanbanState {
  cards: Card[];
  nextId: number;
  settings: KanbanSettings;
}

export const COLUMNS: Column[] = ['backlog', 'planning', 'in-progress', 'review', 'done'];

export const COLUMN_LABELS: Record<Column, string> = {
  backlog: 'Backlog',
  planning: 'Planning',
  'in-progress': 'In Progress',
  review: 'Review',
  done: 'Done',
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const DEFAULT_KANBAN_STATE: KanbanState = {
  cards: [],
  nextId: 1,
  settings: {
    autoAdvance: true,
    maxConcurrentCards: 3,
    requireApproval: {
      plan: true,
      pr: true,
    },
  },
};

export function createCard(
  id: string,
  title: string,
  opts?: Partial<Pick<Card, 'description' | 'priority' | 'acceptance'>>,
): Card {
  const now = new Date().toISOString();
  return {
    id,
    title,
    description: opts?.description ?? '',
    acceptance: opts?.acceptance ?? [],
    priority: opts?.priority ?? 'medium',
    column: 'backlog',
    status: 'idle',
    subtasks: [],
    createdAt: now,
    updatedAt: now,
  };
}
