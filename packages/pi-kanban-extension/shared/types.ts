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
  lastCheckpoint?: string; // Latest VCS checkpoint ID
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
