import { describe, expect, it } from 'vitest';

import { FIXTURES } from '../__preview__/fixture';
import type { ProjectRecord } from '../../shared/record';
import type { WaitRegistration } from '../../shared/waits';
import { limitRows, waitCard } from '../lib/wait-status';

const NOW = Date.parse('2026-10-03T12:00:00.000Z');
const at = (minutesAgo: number): string => new Date(NOW - minutesAgo * 60_000).toISOString();

const wait = (patch: Partial<WaitRegistration> = {}): WaitRegistration => ({
  id: 'w1',
  owner: { milestoneId: 'm1', executionId: null },
  source: { kind: 'child', id: 'room-9' },
  condition: 'completed',
  deadline: null,
  controlRevision: 0,
  registeredAt: at(50),
  outcome: null,
  wake: null,
  ...patch,
});

const project = (patch: Partial<ProjectRecord>): ProjectRecord => ({
  ...FIXTURES.build!, paused: false, blockedReason: null, budget: { ...FIXTURES.build!.budget, capUsd: 40, spentUsd: 1 },
  createdAt: at(150), runs: [], ...patch,
});

const row = (card: ReturnType<typeof waitCard>, label: string) => card?.rows.find((entry) => entry.label === label)?.value;

describe('wait card', () => {
  it('shows a waiting project with its deadline and the two times apart', () => {
    const card = waitCard(project({ waits: [wait({ deadline: new Date(NOW + 130 * 60_000).toISOString() })] }), NOW);
    expect(card?.word).toBe('Waiting');
    expect(row(card, 'Waiting for')).toContain('room-9');
    expect(row(card, 'Deadline')).toMatch(/in 2h 10m$/);
    expect(row(card, 'Waiting time')).toBe('50m');
    expect(row(card, 'Active time')).toBe('1h 40m');
    expect(card?.canResume).toBe(false);
  });

  it('leaves out the deadline row when the wait has none', () => {
    const card = waitCard(project({ waits: [wait()] }), NOW);
    expect(card?.rows.map((entry) => entry.label)).toEqual(['Waiting for', 'Active time', 'Waiting time']);
  });

  it('shows Working once the wake was taken, with how the wait ended', () => {
    const outcome = { kind: 'satisfied' as const, at: at(10) };
    const card = waitCard(project({ waits: [wait({ outcome, wake: { reservedAt: at(10), consumedAt: at(9) } })] }), NOW);
    expect(card?.word).toBe('Working');
    expect(row(card, 'Waited for')).toContain('finished at');
    expect(row(card, 'Waiting time')).toBe('40m');
  });

  it('holds an expired wait: On hold, no result, never complete, and offers Resume work', () => {
    const outcome = { kind: 'expired' as const, at: at(5) };
    const card = waitCard(project({ waits: [wait({ deadline: at(5), outcome, wake: { reservedAt: at(5), consumedAt: null } })] }), NOW);
    expect(card?.word).toBe('On hold');
    expect(row(card, 'Waited for')).toMatch(/no result$/);
    expect(row(card, 'Deadline')).toMatch(/passed$/);
    expect(card?.canResume).toBe(true);
  });

  it('stays On hold when the wait expired, whatever else happens to the project', () => {
    const outcome = { kind: 'expired' as const, at: at(5) };
    const record = project({ waits: [wait({ outcome })] });
    expect(waitCard(record, NOW)?.word).toBe('On hold');
  });

  it('shows the manual case from the blocked state', () => {
    const card = waitCard(project({ blockedReason: 'Needs the staging credentials', waits: [] }), NOW);
    expect(card?.word).toBe('Waiting for you');
    expect(row(card, 'Reason')).toBe('Needs the staging credentials');
    expect(row(card, 'Resume')).toBe('You resume it');
    expect(card?.canResume).toBe(true);
  });

  it('shows nothing for a project that never waited', () => {
    expect(waitCard(project({ waits: undefined }), NOW)).toBeNull();
  });
});

describe('limits rows', () => {
  it('says who set each limit in plain words, in the order the record lists them', () => {
    const rows = limitRows(project({}));
    expect(rows[0]).toMatchObject({ id: 'project-cost-cap', setBy: 'You set this' });
    expect(rows.find((entry) => entry.id === 'research-start')?.setBy).toBe('Default');
    expect(rows.find((entry) => entry.id === 'silent-turns')?.setBy).toBe('Safety stop');
    expect(new Set(rows.map((entry) => entry.setBy))).toEqual(new Set(['You set this', 'Default', 'Safety stop']));
  });
});
