/**
 * Kanban types — host-side state definitions.
 *
 * These types mirror the extension's shared/types.ts but are owned by
 * the host. The extension package should NOT be imported into the host
 * except for pure validation logic in shared/validation.ts (which has
 * no side effects and is the single source of truth for transition rules).
 *
 * If you change the state shape here, update
 * packages/pi-kanban-extension/shared/types.ts to match.
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
  /** TDD scenario designation: 'tdd' = write tests first, 'test-after' = tests after, 'no-test' = skip */
  tddDesignation?: 'tdd' | 'test-after' | 'no-test';
  /** File paths this subtask creates or modifies */
  filePaths?: string[];
  /** Estimated complexity: low (~15min), medium (~30min), high (~45min+) */
  complexity?: 'low' | 'medium' | 'high';
  /** Spec review status (per-subtask review mode) */
  specReviewStatus?: 'pending' | 'passed' | 'failed';
  /** Quality review status (per-subtask review mode) */
  qualityReviewStatus?: 'pending' | 'passed' | 'failed';
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
  /** IDs of cards that must be in 'done' before this card can start */
  blockedBy?: string[];
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
  /** Review rigour: 'per-wave' (default) or 'per-subtask' (two-stage) */
  reviewLevel: 'per-wave' | 'per-subtask';
  /** Whether TDD and testing are enabled (default: true). false = POC mode */
  testingEnabled: boolean;
  /** YOLO mode: auto-start, auto-approve, auto-complete — no human gates */
  yoloMode: boolean;
}

export interface KanbanState {
  cards: Card[];
  nextId: number;
  settings: KanbanSettings;
}
