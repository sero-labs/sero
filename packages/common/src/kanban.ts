/**
 * Shared Kanban contracts used by the desktop host and the Kanban plugin.
 *
 * Keep this module renderer-safe and framework-agnostic.
 */

export type Column = 'backlog' | 'planning' | 'in-progress' | 'review' | 'done';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type CardStatus = 'idle' | 'agent-working' | 'waiting-input' | 'paused' | 'failed';
export type ReviewMode = 'full' | 'light';

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
  liveOutput?: string;
  liveOutputSource?: string;
}

export interface ImplementationProgress {
  phase: string;
  startedAt: number;
  currentWave: number;
  totalWaves: number;
  agents: { name: string; status: 'running' | 'completed' | 'failed' }[];
  recentTools: PlanningToolEntry[];
  log: string[];
  liveOutput?: string;
  liveOutputSource?: string;
}

export interface ReviewProgress {
  phase: string;
  startedAt: number;
  agents: { name: string; status: 'running' | 'completed' | 'failed' }[];
  recentTools: PlanningToolEntry[];
  log: string[];
  liveOutput?: string;
  liveOutputSource?: string;
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
  previewUrl?: string;
  previewServerId?: string;
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
  /** Review style: full diff review, or light smoke review for prototype work */
  reviewMode: ReviewMode;
  /** Whether TDD and testing are enabled (default: true). false = POC mode */
  testingEnabled: boolean;
  /** YOLO mode: auto-start, auto-approve, auto-complete — no human gates */
  yoloMode: boolean;
  /** When YOLO mode is enabled, automatically request GitHub PR auto-merge. */
  yoloAutoMergePrs: boolean;
}

export interface KanbanState {
  cards: Card[];
  nextId: number;
  settings: KanbanSettings;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
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

export function createDefaultKanbanState(): KanbanState {
  return {
    cards: [],
    nextId: 1,
    settings: {
      autoAdvance: true,
      reviewMode: 'full',
      testingEnabled: true,
      yoloMode: false,
      yoloAutoMergePrs: false,
    },
  };
}

export const DEFAULT_KANBAN_STATE: KanbanState = createDefaultKanbanState();

export function createCard(
  id: string,
  title: string,
  opts?: Partial<Pick<Card, 'description' | 'priority' | 'acceptance' | 'blockedBy'>>,
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
    blockedBy: opts?.blockedBy ?? [],
    subtasks: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Validate whether a card meets the requirements to transition to `targetColumn`.
 *
 * Returns `{ valid: true }` for transitions that have no contract
 * (e.g. manual moves back to backlog).
 */
export function validateCardTransition(
  card: Card,
  targetColumn: Column,
  state?: KanbanState,
): ValidationResult {
  const errors: string[] = [];
  const from = card.column;

  if (from === 'backlog' && targetColumn === 'planning') {
    if (!card.title.trim()) {
      errors.push('Card must have a title before starting planning');
    }
    if (!card.description.trim()) {
      errors.push('Card must have a description (at least a sentence explaining the intent)');
    }
    const unmet = getUnmetDependencies(card, state);
    if (unmet.length > 0) {
      errors.push(`Blocked by card(s) not yet done: ${unmet.map((id) => `#${id}`).join(', ')}`);
    }
  }

  if (from === 'planning' && targetColumn === 'in-progress') {
    if (!card.plan?.trim()) {
      errors.push('Card must have a plan before starting implementation');
    }
    if (card.subtasks.length < 1) {
      errors.push('Card must have at least 1 subtask');
    }
    if (card.status !== 'waiting-input') {
      errors.push('Card must be awaiting approval (status: waiting-input)');
    }
  }

  if (from === 'in-progress' && targetColumn === 'review') {
    if (card.subtasks.length === 0 || !card.subtasks.every((subtask) => subtask.status === 'completed')) {
      errors.push('All subtasks must be completed before review');
    }
    if (!card.worktreePath) {
      errors.push('Card must have a worktree with changes');
    }
  }

  if (from === 'review' && targetColumn === 'done') {
    if (card.status !== 'waiting-input') {
      errors.push('Card must be awaiting human confirmation (status: waiting-input)');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateReviewDecision(card: Pick<Card, 'column' | 'status' | 'prUrl'>): ValidationResult {
  const errors: string[] = [];

  if (card.column !== 'review') {
    errors.push('Card must be in Review');
  }
  if (card.status !== 'waiting-input') {
    errors.push('Card must be awaiting human input (status: waiting-input)');
  }
  if (!card.prUrl) {
    errors.push('Card must have a pull request URL');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Returns IDs of cards in the blockedBy list that are NOT in the 'done' column.
 * If no state is provided, returns empty (can't check).
 */
export function getUnmetDependencies(card: Card, state?: KanbanState): string[] {
  if (!card.blockedBy || card.blockedBy.length === 0 || !state) return [];

  return card.blockedBy.filter((depId) => {
    const depCard = state.cards.find((entry) => entry.id === depId);
    return !depCard || depCard.column !== 'done';
  });
}

/**
 * Manual moves are intentionally limited to moving a card back to backlog.
 * Forward workflow transitions must use the dedicated start/approve/complete
 * actions so validation and orchestration stay consistent.
 */
export function getManualMoveTargets(card: Card): Column[] {
  return card.column === 'backlog' ? [] : ['backlog'];
}

export function validateManualMove(card: Card, targetColumn: Column): ValidationResult {
  if (targetColumn === card.column) {
    return { valid: true, errors: [] };
  }

  if (targetColumn === 'backlog' && card.column !== 'backlog') {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: [
      'Manual moves only support sending a card back to Backlog. '
      + 'Use the workflow actions for Start, Approve, and Complete.',
    ],
  };
}
