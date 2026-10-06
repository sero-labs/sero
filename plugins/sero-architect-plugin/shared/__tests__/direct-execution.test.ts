/**
 * Direct execution on the record (spec architect-continuous-execution,
 * architect-project-record, architect-verification-gate).
 */

import { describe, expect, it } from 'vitest';
import {
  activeDirectMilestone,
  beginDirectExecution,
  continueDirectExecution,
  interruptDirectExecutions,
  reportDirectExecution,
  type DirectExecutionStart,
} from '../direct-execution';
import { plannedWorkRemains } from '../../runtime/index';
import { createProjectRecord, type Milestone, type ProjectRecord } from '../record';

const T0 = '2026-10-06T09:00:00.000Z';

const milestone = (overrides: Partial<Milestone> = {}): Milestone => ({
  id: 'm1', title: 'Fix the pager', status: 'approved', plan: null, preview: null, dispatch: null,
  evidence: null, verification: null, parkedBy: null, parkedFrom: null, receipt: null, ...overrides,
});

const project = (milestones: Milestone[] = [milestone()]): ProjectRecord => ({
  ...createProjectRecord({ id: 'p1', name: 'Pager', idea: 'Fix the pager', folder: '/tmp/pager', capUsd: 5, now: T0 }),
  milestones,
  working: { revision: 3, objective: 'Fix the pager', approach: '', assumptions: [], criteria: [], reason: null, updatedAt: T0 },
});

const start = (id = 'exec-1'): DirectExecutionStart => ({
  id, now: T0, placement: { mode: 'workspace', directory: '/tmp/pager', workspaceId: 'ws1' }, baseCommit: 'abc1234', baseFingerprint: 'fp0',
});

function begun(record = project()) {
  const result = beginDirectExecution(record, 'm1', start());
  if (!result.ok) throw new Error(result.reason);
  return result;
}

describe('an execution identity is saved before work starts', () => {
  it('links the milestone to the run, session, placement, baseline and requirement revision', () => {
    const { record, execution } = begun();
    expect(record.milestones[0]?.status).toBe('running');
    expect(execution).toMatchObject({ id: 'exec-1', baseCommit: 'abc1234', requirementRevision: 3, state: 'running' });
    expect(execution.placement.directory).toBe('/tmp/pager');
  });

  it('gives a repeated start the saved identity instead of a second execution', () => {
    const first = begun();
    const again = beginDirectExecution(first.record, 'm1', start('exec-2'));
    expect(again.ok && again.created).toBe(false);
    expect(again.ok && again.execution.id).toBe('exec-1');
    expect(again.ok && again.record).toBe(first.record);
  });

  it('refuses to start beside delegated work on the same milestone', () => {
    const delegated = milestone({ status: 'running', dispatch: { kind: 'workflow', id: 'wf1', workspaceId: 'ws1', dispatchedAt: T0, chargedUsd: 0, destination: null } });
    expect(beginDirectExecution(project([delegated]), 'm1', start()).ok).toBe(false);
  });

  it('reads a milestone saved before direct execution unchanged', () => {
    const saved = milestone({ status: 'verifying', verification: 'reported' });
    const reloaded = JSON.parse(JSON.stringify(project([saved]))) as ProjectRecord;
    expect(reloaded.milestones[0]).toEqual(saved);
    expect(reloaded.milestones[0]?.direct).toBeUndefined();
  });
});

describe('a completion report is a claim', () => {
  it('moves the milestone to verifying and no further', () => {
    const reported = reportDirectExecution(begun().record, 'm1', 'exec-1', 'Fixed the off-by-one.', T0);
    expect(reported.ok).toBe(true);
    const saved = reported.ok ? reported.record.milestones[0] : undefined;
    expect(saved?.status).toBe('verifying');
    expect(saved?.verification).toBe('reported');
    expect(saved?.evidence).toBeNull();
  });

  it('refuses a report that names another execution', () => {
    expect(reportDirectExecution(begun().record, 'm1', 'exec-old', 'done', T0).ok).toBe(false);
  });

  it('refuses a report for requirements that changed after the work started', () => {
    const { record } = begun();
    const revised = { ...record, working: { ...record.working!, revision: 4 } };
    const reported = reportDirectExecution(revised, 'm1', 'exec-1', 'done', T0);
    expect(reported.ok).toBe(false);
    expect(revised.milestones[0]?.status).toBe('running');
  });
});

describe('an interruption is not completion', () => {
  it('keeps the identity and the milestone running, and resumes on continue', () => {
    const stopped = interruptDirectExecutions(begun().record, 'the project was paused');
    expect(stopped.milestones[0]?.status).toBe('running');
    expect(stopped.milestones[0]?.verification).toBeNull();
    expect(stopped.milestones[0]?.direct).toMatchObject({ id: 'exec-1', state: 'interrupted' });
    const resumed = continueDirectExecution(stopped, 'm1', 'exec-1', 'fp1');
    expect(resumed.ok && resumed.execution.state).toBe('running');
  });
});

describe('continuations without a workspace change are counted, not enforced', () => {
  it('counts consecutive unchanged turns and resets when a file changes', () => {
    let record = begun().record;
    for (const fingerprint of ['fp0', 'fp0']) {
      const next = continueDirectExecution(record, 'm1', 'exec-1', fingerprint);
      if (!next.ok) throw new Error(next.reason);
      record = next.record;
    }
    expect(record.milestones[0]?.direct?.idleContinuations).toBe(2);
    const changed = continueDirectExecution(record, 'm1', 'exec-1', 'fp1');
    expect(changed.ok && changed.execution.idleContinuations).toBe(0);
    expect(changed.ok && changed.execution.continuations).toBe(3);
  });
});

describe('requirements that change replace the running work', () => {
  const revised = (record: ProjectRecord): ProjectRecord => ({ ...record, working: { ...record.working!, revision: 4 } });

  it('supersedes the old execution, keeps it as history and starts a new one on the current revision', () => {
    const next = beginDirectExecution(revised(begun().record), 'm1', { ...start('exec-2'), baseFingerprint: 'fp9' });
    if (!next.ok) throw new Error(next.reason);
    expect(next.created).toBe(true);
    const saved = next.record.milestones[0];
    expect(saved?.direct).toMatchObject({ id: 'exec-2', state: 'running', requirementRevision: 4, baseFingerprint: 'fp9' });
    expect(saved?.directHistory).toMatchObject([{ id: 'exec-1', state: 'superseded', requirementRevision: 3 }]);
    // The old identity can no longer report, and the new one can.
    expect(reportDirectExecution(next.record, 'm1', 'exec-1', 'done', T0).ok).toBe(false);
    expect(reportDirectExecution(next.record, 'm1', 'exec-2', 'done', T0).ok).toBe(true);
    expect(activeDirectMilestone(next.record)?.direct?.id).toBe('exec-2');
  });

  it('still returns the same execution while the revision is unchanged', () => {
    const again = beginDirectExecution(begun().record, 'm1', start('exec-2'));
    expect(again.ok && again.execution.id).toBe('exec-1');
  });
});

describe('a decision that parks the milestone holds its work', () => {
  const parked = (record: ProjectRecord): ProjectRecord => ({
    ...record,
    milestones: record.milestones.map((item) => ({ ...item, status: 'parked' as const, parkedBy: 'dec-1', parkedFrom: 'running' as const })),
  });

  it('refuses begin, continue and report until the user answers', () => {
    const held = parked(begun().record);
    expect(beginDirectExecution(held, 'm1', start('exec-2'))).toMatchObject({ ok: false, reason: expect.stringContaining('dec-1') });
    expect(continueDirectExecution(held, 'm1', 'exec-1', 'fp1')).toMatchObject({ ok: false });
    expect(reportDirectExecution(held, 'm1', 'exec-1', 'done', T0)).toMatchObject({ ok: false });
  });
});

describe('direct work that repairs a delegated milestone', () => {
  const dispatch = { kind: 'workflow' as const, id: 'wf1', workspaceId: 'ws1', dispatchedAt: T0, chargedUsd: 0, destination: null };
  const failedEvidence = { commit: 'abc', checkedAt: T0, commands: [], diffSummary: null, filesChanged: true, preview: null, passed: false, stale: false };
  const reportedByDelegate = () => project([milestone({ status: 'verifying', verification: 'reported', dispatch, evidence: failedEvidence })]);

  it('can begin again after a requirement change, because the delegate had already finished', () => {
    const first = begun(reportedByDelegate());
    const revised = { ...first.record, working: { ...first.record.working!, revision: 4 } };
    const second = beginDirectExecution(revised, 'm1', start('exec-2'));
    if (!second.ok) throw new Error(second.reason);
    expect(reportDirectExecution(second.record, 'm1', 'exec-2', 'fixed', T0).ok).toBe(true);
  });

  it('still refuses while the delegate is running', () => {
    expect(beginDirectExecution(project([milestone({ status: 'running', dispatch })]), 'm1', start()).ok).toBe(false);
  });

  it('leaves a reported milestone without current evidence, so a restart wakes the owner to verify it', () => {
    const first = begun(reportedByDelegate());
    const reported = reportDirectExecution(first.record, 'm1', 'exec-1', 'fixed', T0);
    if (!reported.ok) throw new Error(reported.reason);
    expect(reported.record.milestones[0]?.evidence?.stale).toBe(true);
    expect(plannedWorkRemains({ ...reported.record, phase: 'build' })).toBe(true);
  });
});
