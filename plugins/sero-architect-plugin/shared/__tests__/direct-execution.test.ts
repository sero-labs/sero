/**
 * Direct execution on the record (spec architect-continuous-execution,
 * architect-project-record, architect-verification-gate).
 */

import { describe, expect, it } from 'vitest';
import {
  beginDirectExecution,
  continueDirectExecution,
  interruptDirectExecutions,
  reportDirectExecution,
  type DirectExecutionStart,
} from '../direct-execution';
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
