/**
 * Lightweight transition validation for kanban cards.
 *
 * Shared between the Pi extension (CLI) and can be used by the web UI.
 * Mirrors the host-side contracts logic without importing host modules.
 */

import type { Card, Column, KanbanState } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate whether a card meets the requirements to transition to `targetColumn`.
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
    if (card.acceptance.length < 1) {
      errors.push('Card must have at least 1 acceptance criterion');
    }
    // Check card-to-card dependencies
    if (card.blockedBy && card.blockedBy.length > 0 && state) {
      const unmet = card.blockedBy.filter((depId) => {
        const dep = state.cards.find((c) => c.id === depId);
        return !dep || dep.column !== 'done';
      });
      if (unmet.length > 0) {
        errors.push(`Blocked by card(s) not yet done: ${unmet.map((id) => `#${id}`).join(', ')}`);
      }
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

  if (from === 'review' && targetColumn === 'done') {
    if (card.status !== 'waiting-input') {
      errors.push('Card must be awaiting human confirmation (status: waiting-input)');
    }
  }

  return { valid: errors.length === 0, errors };
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
