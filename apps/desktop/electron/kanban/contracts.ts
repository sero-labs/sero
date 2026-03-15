/**
 * Stage contracts — defines input requirements, expected outputs, and quality
 * gates for each kanban column transition.
 *
 * The orchestrator and extension call `validateTransition()` before allowing
 * a card to move between columns. Contracts are pure application logic —
 * they do NOT reference prompt templates or agent system prompts.
 */

import type { Card, Column, KanbanState } from './types';

// ── Contract Types ───────────────────────────────────────────

export interface StageContract {
  /** Which column transition this contract governs */
  transition: `${Column}->${Column}`;

  /** Fields that must be populated on the card before entering */
  requiredInputs: RequiredInput[];

  /** What this stage produces (documentation + validation) */
  expectedOutputs: ExpectedOutput[];

  /** Quality gates that must pass before the card advances */
  qualityGates: QualityGate[];
}

export interface RequiredInput {
  field: keyof Card;
  validation: 'non-empty' | 'min-items' | 'custom';
  /** Minimum item count when validation is 'min-items' */
  minItems?: number;
  /** Custom validation function name (resolved at runtime) */
  customFn?: string;
  /** Error shown if validation fails */
  message: string;
}

export interface ExpectedOutput {
  field: keyof Card;
  description: string;
}

export interface QualityGate {
  name: string;
  type: 'agent-review' | 'command' | 'field-check';
  /** For 'command': shell command to run (e.g., 'pnpm typecheck') */
  command?: string;
  /** For 'agent-review': which agent template to dispatch */
  agent?: string;
  /** For 'field-check': card field that must be truthy */
  field?: string;
  /** Whether failure blocks advancement or is advisory */
  blocking: boolean;
}

// ── Validation Result ────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Contract Definitions ─────────────────────────────────────

const BACKLOG_TO_PLANNING: StageContract = {
  transition: 'backlog->planning',
  requiredInputs: [
    {
      field: 'title',
      validation: 'non-empty',
      message: 'Card must have a title before starting planning',
    },
    {
      field: 'description',
      validation: 'non-empty',
      message: 'Card must have a description (at least a sentence explaining the intent)',
    },
    {
      field: 'acceptance',
      validation: 'min-items',
      minItems: 1,
      message: 'Card must have at least 1 acceptance criterion',
    },
  ],
  expectedOutputs: [
    { field: 'plan', description: 'Prose implementation approach' },
    { field: 'subtasks', description: 'Decomposed work items with dependency graph' },
  ],
  qualityGates: [],
};

const PLANNING_TO_IN_PROGRESS: StageContract = {
  transition: 'planning->in-progress',
  requiredInputs: [
    {
      field: 'plan',
      validation: 'non-empty',
      message: 'Card must have a plan before starting implementation',
    },
    {
      field: 'subtasks',
      validation: 'min-items',
      minItems: 1,
      message: 'Card must have at least 1 subtask',
    },
    {
      field: 'status',
      validation: 'custom',
      customFn: 'isWaitingInput',
      message: 'Card must be awaiting approval (status: waiting-input)',
    },
  ],
  expectedOutputs: [
    { field: 'subtasks', description: 'All subtasks completed' },
    { field: 'worktreePath', description: 'Code changes committed in worktree' },
  ],
  qualityGates: [],
};

const IN_PROGRESS_TO_REVIEW: StageContract = {
  transition: 'in-progress->review',
  requiredInputs: [
    {
      field: 'subtasks',
      validation: 'custom',
      customFn: 'allSubtasksCompleted',
      message: 'All subtasks must be completed before review',
    },
    {
      field: 'worktreePath',
      validation: 'non-empty',
      message: 'Card must have a worktree with changes',
    },
  ],
  expectedOutputs: [
    { field: 'prUrl', description: 'Pull request URL' },
    { field: 'prNumber', description: 'Pull request number' },
  ],
  qualityGates: [
    {
      name: 'reviewer-approval',
      type: 'agent-review',
      agent: 'reviewer',
      blocking: true,
    },
  ],
};

const REVIEW_TO_DONE: StageContract = {
  transition: 'review->done',
  requiredInputs: [
    {
      field: 'status',
      validation: 'custom',
      customFn: 'isWaitingInput',
      message: 'Card must be awaiting human confirmation (status: waiting-input)',
    },
  ],
  expectedOutputs: [
    { field: 'completedAt', description: 'Completion timestamp' },
  ],
  qualityGates: [],
};

// ── Contract Registry ────────────────────────────────────────

const CONTRACTS: Record<string, StageContract> = {
  'backlog->planning': BACKLOG_TO_PLANNING,
  'planning->in-progress': PLANNING_TO_IN_PROGRESS,
  'in-progress->review': IN_PROGRESS_TO_REVIEW,
  'review->done': REVIEW_TO_DONE,
};

export function getContract(from: Column, to: Column): StageContract | null {
  return CONTRACTS[`${from}->${to}`] ?? null;
}

// ── Custom Validators ────────────────────────────────────────

const CUSTOM_VALIDATORS: Record<string, (card: Card) => boolean> = {
  isWaitingInput: (card) => card.status === 'waiting-input',
  allSubtasksCompleted: (card) =>
    card.subtasks.length > 0 && card.subtasks.every((s) => s.status === 'completed'),
};

// ── Validation ───────────────────────────────────────────────

/**
 * Validate whether a card meets the requirements to transition to `targetColumn`.
 *
 * Also checks card-to-card dependencies (blockedBy) when moving to planning.
 */
export function validateTransition(
  card: Card,
  targetColumn: Column,
  state?: KanbanState,
): ValidationResult {
  const errors: string[] = [];

  // Determine the transition key
  const contract = getContract(card.column, targetColumn);

  // No contract means the transition is always allowed (e.g. manual moves)
  if (!contract) return { valid: true, errors: [] };

  // Check required inputs
  for (const req of contract.requiredInputs) {
    if (!validateInput(card, req)) {
      errors.push(req.message);
    }
  }

  // Check card-to-card dependencies when starting planning
  if (targetColumn === 'planning' && card.blockedBy && card.blockedBy.length > 0 && state) {
    const unmetDeps = getUnmetDependencies(card, state);
    if (unmetDeps.length > 0) {
      errors.push(
        `Blocked by card(s) not yet done: ${unmetDeps.map((id) => `#${id}`).join(', ')}`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateInput(card: Card, req: RequiredInput): boolean {
  const value = card[req.field];

  switch (req.validation) {
    case 'non-empty':
      if (typeof value === 'string') return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return value != null;

    case 'min-items':
      return Array.isArray(value) && value.length >= (req.minItems ?? 1);

    case 'custom':
      if (req.customFn && CUSTOM_VALIDATORS[req.customFn]) {
        return CUSTOM_VALIDATORS[req.customFn](card);
      }
      return true;

    default:
      return true;
  }
}

// ── Dependency Helpers ───────────────────────────────────────

/**
 * Returns IDs of cards in the blockedBy list that are NOT in the 'done' column.
 */
export function getUnmetDependencies(card: Card, state: KanbanState): string[] {
  if (!card.blockedBy || card.blockedBy.length === 0) return [];

  return card.blockedBy.filter((depId) => {
    const depCard = state.cards.find((c) => c.id === depId);
    // If the blocking card doesn't exist, treat as unmet (safety)
    return !depCard || depCard.column !== 'done';
  });
}

/**
 * Find cards that were blocked by the given card and are now unblocked
 * (all their blockedBy dependencies are in 'done').
 */
export function getNewlyUnblockedCards(
  completedCardId: string,
  state: KanbanState,
): Card[] {
  return state.cards.filter((c) => {
    if (!c.blockedBy?.includes(completedCardId)) return false;
    if (c.column !== 'backlog') return false;
    return getUnmetDependencies(c, state).length === 0;
  });
}

/**
 * Find ALL backlog cards that are ready to start (all dependencies met).
 * Used by YOLO mode to sweep the entire backlog after any card completes.
 */
export function getAllReadyBacklogCards(state: KanbanState): Card[] {
  return state.cards.filter((c) => {
    if (c.column !== 'backlog') return false;
    if (c.status !== 'idle') return false;
    return getUnmetDependencies(c, state).length === 0;
  });
}
