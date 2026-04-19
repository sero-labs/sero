import {
  getUnmetDependencies as getSharedUnmetDependencies,
  validateCardTransition,
  type ValidationResult,
} from '@sero/common';
import type { Card, Column, KanbanState } from './types';

export type { ValidationResult };

export const validateTransition: (
  card: Card,
  targetColumn: Column,
  state?: KanbanState,
) => ValidationResult = validateCardTransition;

export const getUnmetDependencies: (
  card: Card,
  state?: KanbanState,
) => string[] = getSharedUnmetDependencies;

export interface StageContract {
  transition: `${Column}->${Column}`;
  requiredInputs: RequiredInput[];
  expectedOutputs: ExpectedOutput[];
  qualityGates: QualityGate[];
}

export interface RequiredInput {
  field: keyof Card;
  validation: 'non-empty' | 'min-items' | 'custom';
  minItems?: number;
  customFn?: string;
  message: string;
}

export interface ExpectedOutput {
  field: keyof Card;
  description: string;
}

export interface QualityGate {
  name: string;
  type: 'agent-review' | 'command' | 'field-check';
  command?: string;
  agent?: string;
  field?: string;
  blocking: boolean;
}

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

const CONTRACTS: Record<string, StageContract> = {
  'backlog->planning': BACKLOG_TO_PLANNING,
  'planning->in-progress': PLANNING_TO_IN_PROGRESS,
  'in-progress->review': IN_PROGRESS_TO_REVIEW,
  'review->done': REVIEW_TO_DONE,
};

export function getContract(from: Column, to: Column): StageContract | null {
  return CONTRACTS[`${from}->${to}`] ?? null;
}

export function getNewlyUnblockedCards(
  completedCardId: string,
  state: KanbanState,
): Card[] {
  return state.cards.filter((card) => {
    if (!card.blockedBy?.includes(completedCardId)) return false;
    if (card.column !== 'backlog') return false;
    return getUnmetDependencies(card, state).length === 0;
  });
}

export function getAllReadyBacklogCards(state: KanbanState): Card[] {
  return state.cards.filter((card) => {
    if (card.column !== 'backlog') return false;
    if (card.status !== 'idle') return false;
    return getUnmetDependencies(card, state).length === 0;
  });
}
