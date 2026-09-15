import { describe, expect, it } from 'vitest';
import { closeDeliveredObjectives } from '../objective-completion';
import { applyDelivery } from '../delivery';
import { openRun } from '../../shared/runs';
import { buildingProject, milestone, T0 } from './helpers';

describe('delivery closes the objective', () => {
  it.each(['receipt', 'acceptance'])('waits for both proofs when %s arrives first', (first) => {
    const release = milestone('release', {
      status: 'done', verification: first === 'acceptance' ? 'accepted' : 'reported',
      receipt: first === 'receipt' ? '/release/result' : null,
    });
    const opened = openRun(buildingProject({ phase: 'release', milestones: [release] }), { id: 'initial', kind: 'initial' }, T0);
    if (!opened.ok) throw new Error(opened.error);
    const waiting = applyDelivery(opened.record, release, T0).record;
    expect(waiting.runs?.[0].endedAt).toBeNull();
    const accepted = { ...release, receipt: '/release/result', verification: 'accepted' as const };
    const finished = applyDelivery(waiting, accepted, T0).record;
    expect(finished.phase).toBe('maintain');
    expect(finished.runs?.[0]).toMatchObject({ endedAt: T0, outcome: 'delivered' });
    expect(applyDelivery(finished, accepted, 'later').record.runs).toEqual(finished.runs);
  });

  it('keeps a maintenance objective open until all its milestones are delivered', () => {
    const one = milestone('one', { runId: 'repair', status: 'done', verification: 'accepted', receipt: '/one' });
    const two = milestone('two', { runId: 'repair' });
    const opened = openRun(buildingProject({ phase: 'maintain', milestones: [one, two] }), { id: 'repair', kind: 'maintenance', objectiveId: 'issue' }, T0);
    if (!opened.ok) throw new Error(opened.error);
    const first = applyDelivery(opened.record, one, T0).record;
    expect(first.runs?.[0].endedAt).toBeNull();
    const nextObjective = openRun(first, { id: 'other', kind: 'maintenance', objectiveId: 'other-issue' }, T0);
    if (!nextObjective.ok) throw new Error(nextObjective.error);
    const finished = applyDelivery(nextObjective.record, { ...two, status: 'done', verification: 'accepted', receipt: '/two' }, T0).record;
    expect(finished.runs?.[0].outcome).toBe('delivered');
    expect(finished.runs?.[1].endedAt).toBeNull();
  });
});

it('closes a delivered objective when its last research result arrives', () => {
  const pending = { id: 'r', question: 'q', stoppingCondition: 'answer', startedAt: T0, project: { projectId: 'proj_1', runId: 'repair' } };
  const task = milestone('one', { runId: 'repair', status: 'done', verification: 'accepted', receipt: '/one' });
  const opened = openRun(buildingProject({ phase: 'maintain', milestones: [task], pendingResearch: [pending] }), { id: 'repair', kind: 'maintenance', objectiveId: 'issue' }, T0);
  if (!opened.ok) throw new Error(opened.error);
  const delivered = applyDelivery(opened.record, task, T0).record;
  expect(delivered.runs?.[0].endedAt).toBeNull();
  const finished = closeDeliveredObjectives({ ...delivered, pendingResearch: [] }, T0);
  expect(finished.runs?.[0].outcome).toBe('delivered');
  expect(closeDeliveredObjectives(finished, 'later').runs).toEqual(finished.runs);
});
