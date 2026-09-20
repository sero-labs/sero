/**
 * The derived activity. The last case is the fault this change exists for:
 * FroggerNeon read "Working on M2" for three days after its Workflow stopped,
 * because the state was a sentence the owner wrote and nobody re-checked.
 */

import { describe, expect, it } from 'vitest';
import { milestoneCounts, projectActivity } from '../activity';
import { createProjectRecord, type Milestone, type ProjectRecord } from '../record';
import { MAINTENANCE_MILESTONE_ID } from '../maintenance';

const T0 = '2026-09-10T09:00:00.000Z';
const SESSION = '2026-09-19T10:00:00.000Z';
const RUNNING_SESSION = { sessionStartedAt: SESSION, runtimeRunning: true };
const ARCHITECT_OFF = { sessionStartedAt: SESSION, runtimeRunning: false };

function project(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  const base = createProjectRecord({ id: 'proj_1', name: 'FroggerNeon', idea: 'A frogger clone.', folder: '/p', now: T0 });
  return { ...base, phase: 'build', ...overrides };
}

function milestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: 'm2',
    title: 'M2 · Adversarial review',
    status: 'running',
    plan: null,
    preview: null,
    dispatch: null,
    evidence: null,
    verification: null,
    parkedBy: null,
    parkedFrom: null,
    receipt: null,
    ...overrides,
  };
}

function dispatch(overrides: Partial<NonNullable<Milestone['dispatch']>> = {}) {
  return {
    kind: 'workflow' as const,
    id: 'loop-1',
    workspaceId: 'ws-1',
    dispatchedAt: '2026-09-16T08:00:00.000Z',
    chargedUsd: 0,
    destination: null,
    ...overrides,
  };
}

describe('projectActivity', () => {
  it('reads a dispatch this session watched report as working', () => {
    const record = project({
      milestones: [milestone({ dispatch: dispatch({ observedLiveAt: '2026-09-19T10:04:00.000Z' }) })],
    });

    const activity = projectActivity(record, RUNNING_SESSION);

    expect(activity.state).toBe('working');
    expect(activity.headline).toBe('Working on M2 · Adversarial review');
    expect(activity.ownerSuffix).toBe('Architect idle');
  });

  // Nobody refreshes the mark once the runtime stops, so a mark it wrote
  // earlier in this same session must not keep the row reading "Working".
  it('will not claim working from a mark once the runtime has stopped', () => {
    const record = project({
      milestones: [milestone({ dispatch: dispatch({ observedLiveAt: '2026-09-19T10:04:00.000Z' }) })],
    });

    const activity = projectActivity(record, ARCHITECT_OFF);

    expect(activity.state).toBe('last-known');
    expect(activity.ownerSuffix).toBe('Architect is not running');
  });

  it('reads a saved running milestone with no observed report as last known', () => {
    const record = project({
      milestones: [milestone({ dispatch: dispatch({ lastRunAt: '2026-09-16T08:12:00.000Z' }) })],
    });

    const activity = projectActivity(record, RUNNING_SESSION);

    expect(activity.state).toBe('last-known');
    expect(activity.headline).toBe('Last known: working on M2 · Adversarial review');
    expect(activity.lastReportAt).toBe('2026-09-16T08:12:00.000Z');
  });

  it('refuses a stamp left by an earlier session', () => {
    const record = project({
      milestones: [milestone({ dispatch: dispatch({ observedLiveAt: '2026-09-16T08:12:00.000Z' }) })],
    });

    expect(projectActivity(record, RUNNING_SESSION).state).toBe('last-known');
  });

  it('says the Architect is not running when it is not', () => {
    const record = project({ milestones: [milestone({ dispatch: dispatch({ lastRunAt: '2026-09-16T08:12:00.000Z' }) })] });

    expect(projectActivity(record, ARCHITECT_OFF).ownerSuffix).toBe('Architect is not running');
  });

  it('leads with a stopped step and the action that clears it', () => {
    const record = project({
      milestones: [milestone({
        dispatch: dispatch({ failure: 'The run was interrupted', retryStepId: 'step-2', lastRunAt: '2026-09-16T08:12:00.000Z' }),
      })],
    });

    const activity = projectActivity(record, RUNNING_SESSION);

    expect(activity.state).toBe('stopped');
    expect(activity.headline).toBe('Stopped at M2 · Adversarial review');
    expect(activity.action).toBe('Retry the step');
  });

  it('leads with the spend cap before anything else', () => {
    const record = project({
      budget: { capUsd: 10, spentUsd: 10.47, incomplete: false, sources: { owner: 0, research: 0, dispatched: 10.47 } },
      milestones: [milestone({ id: MAINTENANCE_MILESTONE_ID, title: 'Maintenance', dispatch: dispatch({ id: 'loop-maint' }) })],
    });

    const activity = projectActivity(record, RUNNING_SESSION);

    expect(activity.state).toBe('stopped');
    expect(activity.headline).toBe('Stopped by the spend cap');
    expect(activity.action).toBe('Raise the cap');
  });

  it('says a paused project paused its maintenance Workflow with it', () => {
    const record = project({
      paused: true,
      phase: 'maintain',
      milestones: [milestone({
        id: MAINTENANCE_MILESTONE_ID,
        title: 'Maintenance',
        dispatch: dispatch({ id: 'loop-maint', lastRunAt: '2026-09-14T08:00:00.000Z' }),
      })],
    });

    const activity = projectActivity(record, RUNNING_SESSION);

    expect(activity.state).toBe('paused');
    expect(activity.headline).toBe('Paused by you');
    expect(activity.owner).toBe('Maintenance Workflow paused with the project');
  });

  it('reads an armed maintenance Workflow as waiting for a trigger', () => {
    const record = project({
      phase: 'maintain',
      milestones: [milestone({
        id: MAINTENANCE_MILESTONE_ID,
        title: 'Maintenance',
        status: 'done',
        dispatch: dispatch({ id: 'loop-maint', lastRunAt: '2026-09-14T08:00:00.000Z' }),
      })],
    });

    const activity = projectActivity(record, RUNNING_SESSION);

    expect(activity.state).toBe('waiting-for-trigger');
    expect(activity.headline).toBe('Maintenance is waiting for a trigger');
    expect(activity.ownerAt).toBe('2026-09-14T08:00:00.000Z');
  });

  it('names the action when a decision is open', () => {
    const record = project({
      decisions: [{
        id: 'dec-1',
        question: 'Which contract governs the edge case?',
        options: [],
        recommendation: '',
        reason: '',
        dependsOn: [],
        raisedAt: '2026-09-18T09:00:00.000Z',
        proposal: null,
        answer: null,
      }],
    });

    const activity = projectActivity(record, RUNNING_SESSION);

    expect(activity.state).toBe('waiting-for-you');
    expect(activity.action).toBe('Answer the decision');
  });

  it('counts accepted milestones and leaves maintenance out of the count', () => {
    const record = project({
      milestones: [
        milestone({ id: 'm1', status: 'done', verification: 'accepted' }),
        milestone({ id: 'm2', status: 'running' }),
        milestone({ id: MAINTENANCE_MILESTONE_ID, title: 'Maintenance', status: 'done' }),
      ],
    });

    expect(milestoneCounts(record)).toEqual({ accepted: 1, total: 2 });
  });
});

/**
 * A block on delegated work. The captured defect: the project page read
 * "Research Room room_32407438-c1ce-4370-8b3b-96186d4bc056 is cancelled." as
 * its heading, and why the Room could not work was one line among sixty-four
 * History entries.
 */
describe('a project blocked on delegated work', () => {
  const cancelled = (over: Partial<ProjectRecord['blockedOn'] & object> = {}) => project({
    blockedReason: 'Research Room room_3240 is cancelled. Open the Room to review its next action.',
    blockedOn: {
      kind: 'room',
      id: 'room_3240',
      title: 'Import Dashboard Discovery',
      status: 'cancelled',
      at: '2026-09-10T12:00:00.000Z',
      ...over,
    },
  });

  it('names the Room by its title and says what became of it', () => {
    const activity = projectActivity(cancelled(), RUNNING_SESSION);
    expect(activity.headline).toBe('Research was cancelled before it reported');
    expect(activity.owner).toBe('Room Import Dashboard Discovery · cancelled');
    expect(activity.ownerAt).toBe('2026-09-10T12:00:00.000Z');
    expect(activity.headline).not.toContain('room_3240');
  });

  it('states the reason the record saved', () => {
    const activity = projectActivity(
      cancelled({ cause: { text: 'Its members had read-only access and could not run commands.', decisionId: 'dec_1' } }),
      RUNNING_SESSION,
    );
    expect(activity.reason).toBe('Its members had read-only access and could not run commands.');
  });

  it('shows no reason line when nothing recorded a cause', () => {
    expect(projectActivity(cancelled(), RUNNING_SESSION).reason).toBeUndefined();
  });

  it('falls back to the saved sentence for a record written before the fields existed', () => {
    const old = project({ blockedReason: 'Research Room room_3240 is cancelled. Open the Room to review its next action.' });
    const activity = projectActivity(old, RUNNING_SESSION);
    expect(activity.headline).toBe(old.blockedReason);
    expect(activity.reason).toBeUndefined();
  });

  it('falls back to the Room id only when no title was saved', () => {
    const activity = projectActivity(cancelled({ title: null }), RUNNING_SESSION);
    expect(activity.owner).toBe('Room room_3240 · cancelled');
  });
});
