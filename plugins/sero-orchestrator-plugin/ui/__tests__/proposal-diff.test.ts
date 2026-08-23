import { describe, expect, it } from 'vitest';
import type { RoomProposalSummary } from '../../shared/room-blueprint-types';
import { proposalDiff } from '../lib/proposal-diff';

function summary(overrides: Partial<RoomProposalSummary>): RoomProposalSummary {
  return {
    teamSize: 5,
    conductorCount: 1,
    maxWallClockMs: 2 * 3600_000,
    maxCostUsd: 6,
    access: [{ label: 'read-workspace' }, { label: 'edit-workspace' }, { label: 'github-write' }],
    warnings: [],
    title: 'T',
    approach: 'A',
    roles: [
      { displayName: 'Conductor', responsibility: '', isConductor: true },
      { displayName: 'Security reviewer', responsibility: '', isConductor: false },
      { displayName: 'Implementer 1', responsibility: '', isConductor: false },
      { displayName: 'Implementer 2', responsibility: '', isConductor: false },
      { displayName: 'Tester', responsibility: '', isConductor: false },
    ],
    teamRationale: '',
    ...overrides,
  };
}

describe('proposalDiff', () => {
  it('marks changed tiles with the struck-through previous value', () => {
    const prev = summary({});
    const next = summary({
      teamSize: 4,
      maxCostUsd: 2,
      access: [{ label: 'read-workspace' }, { label: 'edit-workspace' }],
      roles: prev.roles.filter((role) => role.displayName !== 'Implementer 2'),
    });
    const diff = proposalDiff(prev, next);
    expect(diff.team).toEqual({ value: '4 members', was: '5 members' });
    expect(diff.time).toEqual({ value: 'Up to 2 hours' });
    expect(diff.spend).toEqual({ value: 'Up to $2.00', was: 'Up to $6.00' });
    expect(diff.access.was).toBe('This workspace and GitHub');
    expect(diff.removed).toEqual(['Implementer 2', 'push branches and open pull requests']);
    expect(diff.added).toEqual([]);
    expect(diff.kept).toContain('the 2 hours limit');
  });

  it('reports everything kept when nothing moved', () => {
    const prev = summary({});
    const diff = proposalDiff(prev, summary({}));
    expect(diff.removed).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.team.was).toBeUndefined();
    expect(diff.kept).toContain('the team');
    expect(diff.kept).toContain('the access you approved');
  });

  it('reports an added member', () => {
    const prev = summary({});
    const next = summary({
      teamSize: 6,
      roles: [...prev.roles, { displayName: 'Migration checker', responsibility: '', isConductor: false }],
    });
    const diff = proposalDiff(prev, next);
    expect(diff.added).toEqual(['Migration checker']);
    expect(diff.removed).toEqual([]);
  });
});
