/**
 * Kanban types — mirror of shared/types.ts from pi-kanban-extension.
 *
 * Duplicated here to avoid importing from the extension package in the
 * Electron main process. Keep in sync with packages/pi-kanban-extension/shared/types.ts.
 */

export type Column = 'backlog' | 'planning' | 'in-progress' | 'review' | 'done';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type CardStatus = 'idle' | 'agent-working' | 'waiting-input' | 'paused' | 'failed';

export interface Subtask {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  dependsOn: string[];
  agentRunId?: string;
  checkpointId?: string;
}

export interface PlanningToolEntry {
  tool: string;
  args: string;
  running: boolean;
}

export interface PlanningProgress {
  phase: string;
  startedAt: number;
  agents: { name: string; status: 'running' | 'completed' | 'failed' }[];
  recentTools: PlanningToolEntry[];
  log: string[];
}

export interface ImplementationProgress {
  phase: string;
  startedAt: number;
  currentWave: number;
  totalWaves: number;
  agents: { name: string; status: 'running' | 'completed' | 'failed' }[];
  recentTools: PlanningToolEntry[];
  log: string[];
}

export interface ReviewProgress {
  phase: string;
  startedAt: number;
  agents: { name: string; status: 'running' | 'completed' | 'failed' }[];
  recentTools: PlanningToolEntry[];
  log: string[];
}

export interface Card {
  id: string;
  title: string;
  description: string;
  acceptance: string[];
  priority: Priority;
  column: Column;
  status: CardStatus;
  branch?: string;
  worktreePath?: string;
  sessionId?: string;
  subtasks: Subtask[];
  plan?: string;
  prUrl?: string;
  prNumber?: number;
  reviewFilePath?: string;
  lastCheckpoint?: string;
  planningProgress?: PlanningProgress;
  implementationProgress?: ImplementationProgress;
  reviewProgress?: ReviewProgress;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface KanbanSettings {
  autoAdvance: boolean;
  maxConcurrentCards: number;
  requireApproval: {
    plan: boolean;
    pr: boolean;
  };
}

export interface KanbanState {
  cards: Card[];
  nextId: number;
  settings: KanbanSettings;
}
