import { describe, expect, it } from 'vitest';

import type { HistoryEntry, HistorySubject } from '../../shared/record';
import { historyLine, historyLink } from '../lib/history-view';

const entry = (subject?: HistorySubject, cause = 'did the thing'): HistoryEntry => ({
  at: '2026-09-10T09:12:00.000Z',
  phase: 'build',
  overlay: null,
  cause,
  ...(subject ? { subject } : {}),
});

describe('the history line', () => {
  it('prefixes the cause with the subject label for a milestone, a Workflow and a Room', () => {
    expect(historyLine(entry({ kind: 'milestone', id: 'm1', label: 'Grid, movement and field of view' })))
      .toBe('Grid, movement and field of view did the thing');
    expect(historyLine(entry({ kind: 'workflow', id: 'workflow-m1', label: 'Grid, movement and field of view' })))
      .toBe('Grid, movement and field of view did the thing');
    expect(historyLine(entry({ kind: 'room', id: 'room-m3', label: 'Items, combat and permadeath' })))
      .toBe('Items, combat and permadeath did the thing');
  });

  it('leaves a decision cause as written, since it is already a sentence', () => {
    expect(historyLine(entry({ kind: 'decision', id: 'd7', label: 'How should the dungeon be drawn?' }, 'Architect asked a question')))
      .toBe('Architect asked a question');
  });

  it('shows the cause written with the entry when it records no subject', () => {
    expect(historyLine(entry(undefined, 'milestone 1 dispatched as a Workflow.')))
      .toBe('milestone 1 dispatched as a Workflow.');
  });

  it('shows the cause alone when the subject carries no name', () => {
    expect(historyLine(entry({ kind: 'workflow', id: 'loop_9', label: null }, 'Workflow resumed')))
      .toBe('Workflow resumed');
  });
});

describe('the history link', () => {
  it('sends a milestone to its evidence and a Workflow or a Room to its record', () => {
    expect(historyLink(entry({ kind: 'milestone', id: 'm4', label: 'Demo page' })))
      .toEqual({ kind: 'evidence', milestoneId: 'm4' });
    expect(historyLink(entry({ kind: 'workflow', id: 'workflow-m1', label: 'Grid' })))
      .toEqual({ kind: 'workflow', id: 'workflow-m1' });
    expect(historyLink(entry({ kind: 'room', id: 'room-m3', label: 'Items' })))
      .toEqual({ kind: 'room', id: 'room-m3' });
  });

  it('draws no link for a decision or an entry with no subject', () => {
    expect(historyLink(entry({ kind: 'decision', id: 'd7', label: 'A question' }))).toBeNull();
    expect(historyLink(entry())).toBeNull();
  });
});
