/**
 * Kanban transition validation — SINGLE SOURCE OF TRUTH.
 *
 * Used by:
 * - Extension CLI (workflow-actions.ts)
 * - Web UI (card-workflow.ts, CardDetail.tsx)
 * - Host orchestrator (contracts.ts re-exports from here)
 *
 * If you change validation rules here, the host-side contracts.ts will
 * pick them up automatically — do NOT duplicate rules elsewhere.
 */

import type { Card, Column, KanbanState } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Transition Validation ────────────────────────────────────

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
    // Card-to-card dependencies
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
    if (card.subtasks.length === 0 || !card.subtasks.every((s) => s.status === 'completed')) {
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

// ── Dependency Helpers ───────────────────────────────────────

/**
 * Returns IDs of cards in the blockedBy list that are NOT in the 'done' column.
 * If no state is provided, returns empty (can't check).
 */
export function getUnmetDependencies(card: Card, state?: KanbanState): string[] {
  if (!card.blockedBy || card.blockedBy.length === 0 || !state) return [];

  return card.blockedBy.filter((depId) => {
    const depCard = state.cards.find((c) => c.id === depId);
    // If the blocking card doesn't exist, treat as unmet (safety)
    return !depCard || depCard.column !== 'done';
  });
}

// ── Manual Move Validation ───────────────────────────────────

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
