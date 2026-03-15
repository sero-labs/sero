/**
 * Stage contracts — defines input requirements, expected outputs, and quality
 * gates for each kanban column transition.
 *
 * Validation logic is NOT duplicated here — it lives in the shared module:
 *   packages/pi-kanban-extension/shared/validation.ts
 * This file re-exports `validateTransition` from there and adds
 * orchestrator-specific helpers (unblocked card scanning, contract metadata).
 */

import type { Card, Column, KanbanState } from './types';

// ── Single source of truth for validation ────────────────────
// Uses structural typing — host Card and shared Card have identical shapes.

import {
  validateCardTransition,
  getUnmetDependencies as _getUnmetDeps,
} from '../../../../packages/pi-kanban-extension/shared/validation';
import type { ValidationResult } from '../../../../packages/pi-kanban-extension/shared/validation';

export type { ValidationResult };

/**
 * Validate whether a card meets the requirements to transition to `targetColumn`.
 * Delegates to the shared validation module (single source of truth).
 */
export const validateTransition: (
  card: Card, targetColumn: Column, state?: KanbanState,
) => ValidationResult = validateCardTransition;

/**
 * Returns IDs of cards in the blockedBy list that are NOT in the 'done' column.
 */
export const getUnmetDependencies: (
  card: Card, state?: KanbanState,
) => string[] = _getUnmetDeps;

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
  ],
  expectedOutputs: [
    { field: 'plan', description: 'Prose implementation approach' },
    { field: 'acceptance', description: 'Acceptance criteria refined or generated during planning' },
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

// ── Orchestrator-only Helpers ────────────────────────────────

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
