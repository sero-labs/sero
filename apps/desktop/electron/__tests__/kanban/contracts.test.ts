/**
 * Tests for stage contracts — transition validation logic.
 */

import { describe, it, expect } from 'vitest';
import {
  validateTransition,
  getContract,
  getUnmetDependencies,
  getNewlyUnblockedCards,
} from '../../kanban/contracts';
import type { Card, KanbanState } from '../../kanban/types';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: '1',
    title: 'Test card',
    description: 'A test card',
    acceptance: ['It works'],
    priority: 'medium',
    column: 'backlog',
    status: 'idle',
    subtasks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeState(cards: Card[]): KanbanState {
  return {
    cards,
    nextId: cards.length + 1,
    settings: {
      autoAdvance: true,
      maxConcurrentCards: 3,
      requireApproval: { plan: true, pr: true },
      reviewLevel: 'per-wave',
      testingEnabled: true,
      yoloMode: false,
    },
  };
}

describe('getContract', () => {
  it('returns contract for known transitions', () => {
    expect(getContract('backlog', 'planning')).not.toBeNull();
    expect(getContract('planning', 'in-progress')).not.toBeNull();
    expect(getContract('in-progress', 'review')).not.toBeNull();
    expect(getContract('review', 'done')).not.toBeNull();
  });

  it('returns null for unknown transitions', () => {
    expect(getContract('done', 'backlog')).toBeNull();
    expect(getContract('backlog', 'done')).toBeNull();
  });
});

describe('validateTransition: backlog → planning', () => {
  it('passes with complete card', () => {
    const card = makeCard();
    const result = validateTransition(card, 'planning');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when title is empty', () => {
    const card = makeCard({ title: '' });
    const result = validateTransition(card, 'planning');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('title'))).toBe(true);
  });

  it('fails when description is empty', () => {
    const card = makeCard({ description: '' });
    const result = validateTransition(card, 'planning');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('description'))).toBe(true);
  });

  it('fails when acceptance criteria are missing', () => {
    const card = makeCard({ acceptance: [] });
    const result = validateTransition(card, 'planning');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('acceptance'))).toBe(true);
  });

  it('collects all errors at once', () => {
    const card = makeCard({ title: '', description: '', acceptance: [] });
    const result = validateTransition(card, 'planning');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(3);
  });

  it('blocks when card has unmet dependencies', () => {
    const blocker = makeCard({ id: '2', column: 'in-progress' });
    const card = makeCard({ id: '1', blockedBy: ['2'] });
    const state = makeState([card, blocker]);
    const result = validateTransition(card, 'planning', state);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('#2'))).toBe(true);
  });

  it('passes when blocking card is done', () => {
    const blocker = makeCard({ id: '2', column: 'done' });
    const card = makeCard({ id: '1', blockedBy: ['2'] });
    const state = makeState([card, blocker]);
    const result = validateTransition(card, 'planning', state);
    expect(result.valid).toBe(true);
  });

  it('treats non-existent blocking cards as unmet', () => {
    const card = makeCard({ blockedBy: ['999'] });
    const state = makeState([card]);
    const result = validateTransition(card, 'planning', state);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('#999'))).toBe(true);
  });
});

describe('validateTransition: planning → in-progress', () => {
  it('passes with plan, subtasks, and waiting-input status', () => {
    const card = makeCard({
      column: 'planning',
      status: 'waiting-input',
      plan: 'Do the thing',
      subtasks: [{ id: '1', title: 'Sub', description: '', status: 'pending', dependsOn: [] }],
    });
    const result = validateTransition(card, 'in-progress');
    expect(result.valid).toBe(true);
  });

  it('fails without plan', () => {
    const card = makeCard({
      column: 'planning',
      status: 'waiting-input',
      subtasks: [{ id: '1', title: 'Sub', description: '', status: 'pending', dependsOn: [] }],
    });
    const result = validateTransition(card, 'in-progress');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('plan'))).toBe(true);
  });

  it('fails without subtasks', () => {
    const card = makeCard({
      column: 'planning',
      status: 'waiting-input',
      plan: 'Do it',
    });
    const result = validateTransition(card, 'in-progress');
    expect(result.valid).toBe(false);
  });

  it('fails when status is not waiting-input', () => {
    const card = makeCard({
      column: 'planning',
      status: 'agent-working',
      plan: 'Do it',
      subtasks: [{ id: '1', title: 'Sub', description: '', status: 'pending', dependsOn: [] }],
    });
    const result = validateTransition(card, 'in-progress');
    expect(result.valid).toBe(false);
  });
});

describe('validateTransition: review → done', () => {
  it('passes when card is waiting-input', () => {
    const card = makeCard({ column: 'review', status: 'waiting-input' });
    const result = validateTransition(card, 'done');
    expect(result.valid).toBe(true);
  });

  it('fails when card is not waiting-input', () => {
    const card = makeCard({ column: 'review', status: 'agent-working' });
    const result = validateTransition(card, 'done');
    expect(result.valid).toBe(false);
  });
});

describe('validateTransition: unknown transitions', () => {
  it('allows moves that have no contract (e.g. done → backlog)', () => {
    const card = makeCard({ column: 'done' });
    const result = validateTransition(card, 'backlog');
    expect(result.valid).toBe(true);
  });
});

describe('getUnmetDependencies', () => {
  it('returns empty when no blockedBy', () => {
    const card = makeCard();
    const state = makeState([card]);
    expect(getUnmetDependencies(card, state)).toEqual([]);
  });

  it('returns unmet deps that are not in done', () => {
    const card = makeCard({ blockedBy: ['2', '3'] });
    const dep2 = makeCard({ id: '2', column: 'in-progress' });
    const dep3 = makeCard({ id: '3', column: 'done' });
    const state = makeState([card, dep2, dep3]);
    expect(getUnmetDependencies(card, state)).toEqual(['2']);
  });
});

describe('getNewlyUnblockedCards', () => {
  it('finds cards unblocked by completed card', () => {
    const blocker = makeCard({ id: '1', column: 'done' });
    const blocked = makeCard({ id: '2', column: 'backlog', blockedBy: ['1'] });
    const state = makeState([blocker, blocked]);
    const unblocked = getNewlyUnblockedCards('1', state);
    expect(unblocked).toHaveLength(1);
    expect(unblocked[0].id).toBe('2');
  });

  it('does not include cards with other unmet deps', () => {
    const done1 = makeCard({ id: '1', column: 'done' });
    const notDone = makeCard({ id: '3', column: 'in-progress' });
    const blocked = makeCard({ id: '2', column: 'backlog', blockedBy: ['1', '3'] });
    const state = makeState([done1, notDone, blocked]);
    expect(getNewlyUnblockedCards('1', state)).toHaveLength(0);
  });

  it('only considers backlog cards', () => {
    const blocker = makeCard({ id: '1', column: 'done' });
    const alreadyMoving = makeCard({ id: '2', column: 'planning', blockedBy: ['1'] });
    const state = makeState([blocker, alreadyMoving]);
    expect(getNewlyUnblockedCards('1', state)).toHaveLength(0);
  });
});
