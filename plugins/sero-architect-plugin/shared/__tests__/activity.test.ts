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

describe('research activity before milestones exist', () => {
  const pending = { id: 'res-1', question: 'Which audio graph?', stoppingCondition: 'A cited answer.', startedAt: T0 };
  const reportedAt = '2026-09-19T10:04:00.000Z';

  it.each(['room', 'workflow', undefined] as const)('shows observed %s research as working', (kind) => {
    const record = project({ phase: 'discovery', milestones: [], pendingResearch: [{
      ...pending, kind, observedLiveAt: reportedAt,
      ...(kind === 'room' ? { roomId: 'room-1' } : kind === 'workflow' ? { workflowId: 'loop-1' } : { runId: 'run-1' }),
    }] });
    const activity = projectActivity(record, RUNNING_SESSION);
    expect(activity.state).toBe('working');
    expect(activity.ownerAt).toBe(reportedAt);
    expect(activity.ownerSuffix).toBe('Architect idle');
  });

  it.each([undefined, T0])('does not claim a saved Room is live without a report from this session (%s)', (observedLiveAt) => {
    const record = project({ phase: 'discovery', milestones: [], pendingResearch: [{ ...pending, kind: 'room', roomId: 'room-1', observedLiveAt }] });
    expect(projectActivity(record, RUNNING_SESSION).state).toBe('last-known');
  });

  it('does not claim research is live when the runtime is off', () => {
    const record = project({ pendingResearch: [{ ...pending, kind: 'room', roomId: 'room-1', observedLiveAt: reportedAt }] });
    expect(projectActivity(record, ARCHITECT_OFF).state).toBe('last-known');
  });

  it('shows preparation before research has a linked run', () => {
    const activity = projectActivity(project({ pendingResearch: [{ ...pending, kind: 'room' }] }), RUNNING_SESSION);
    expect(activity.state).toBe('idle');
    expect(activity.headline).not.toBe('Nothing is running');
  });

  it('shows live research before a milestone with only a stale report', () => {
    const record = project({
      milestones: [milestone({ dispatch: dispatch({ observedLiveAt: T0 }) })],
      pendingResearch: [{ ...pending, kind: 'room', roomId: 'room-1', observedLiveAt: reportedAt }],
    });
    expect(projectActivity(record, RUNNING_SESSION).state).toBe('working');
  });
});

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

  it('reads a reported milestone as being checked only while this session shows the Architect at work', () => {
    const reported = milestone({ status: 'verifying', verification: 'reported', dispatch: dispatch({ lastRunAt: '2026-09-16T08:12:00.000Z' }) });
    const base = project({ milestones: [reported] });
    const inTurn = { ...base, session: { ...base.session, workingSince: '2026-09-19T10:05:00.000Z' } };
    const oldTurn = { ...base, session: { ...base.session, workingSince: '2026-09-16T08:13:00.000Z' } };

    expect(projectActivity(inTurn, RUNNING_SESSION)).toMatchObject({ state: 'working', headline: 'Checking M2 · Adversarial review' });
    expect(projectActivity(oldTurn, RUNNING_SESSION)).toMatchObject({ state: 'last-known', headline: 'Last known: checking M2 · Adversarial review' });
    expect(projectActivity(inTurn, ARCHITECT_OFF).state).toBe('last-known');
  });

  it('says a dispatch is being prepared before its Workflow exists, and only this session can claim it', () => {
    const pending = (startedAt: string) => project({ milestones: [milestone({ status: 'approved', pendingDispatch: { kind: 'workflow', destination: null, startedAt } })] });

    expect(projectActivity(pending('2026-09-19T10:05:00.000Z'), RUNNING_SESSION)).toMatchObject({ state: 'working', headline: 'Starting M2 · Adversarial review', owner: 'Workflow is being prepared' });
    expect(projectActivity(pending('2026-09-16T08:00:00.000Z'), RUNNING_SESSION).headline).toBe('Last known: starting M2 · Adversarial review');
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
    // The heading names what stopped, and the cause rides the activity line
    // beside the state glyph — the same one line the drawing shows. Neither
    // repeats the other, and the state is not stated a third time.
    expect(activity.headline).toBe('M2 · Adversarial review stopped');
    expect(activity.owner).toBe('The run was interrupted');
    expect(activity.reason).toBeUndefined();
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

  it('says a paused project is still finishing the turns in flight, and counts them', () => {
    const feedback = (activeCount: number) => ({ activeCount, current: [], lastActivityAt: null, contactObservedAt: null });
    const paused = project({ paused: true });

    expect(projectActivity(paused, { ...RUNNING_SESSION, feedback: feedback(1) }).owner).toBe('1 turn is still finishing');
    expect(projectActivity(paused, { ...RUNNING_SESSION, feedback: feedback(3) }).owner).toBe('3 turns are still finishing');
    expect(projectActivity(paused, RUNNING_SESSION).owner).toBe('Nothing runs until you resume');
  });

  it('reads an agreement whose start is not approved as not started, with Review access', () => {
    const record = project({ agreement: { revision: 1, capUsd: 5, proposedAt: T0, approvedAt: null, authority: null } });

    expect(projectActivity(record, RUNNING_SESSION)).toMatchObject({ state: 'idle', headline: 'Not started', action: 'Review access' });
  });

  it('leads a delivered agreement with Delivered and keeps maintenance as the detail', () => {
    const record = project({
      phase: 'maintain',
      agreement: { revision: 1, capUsd: 5, proposedAt: T0, approvedAt: T0, authority: { policyId: 'policy-1', workspaceId: 'ws-1', roles: {}, maxLiveSessions: 8, maxTotalSessions: 64 } },
      milestones: [
        milestone({ status: 'done', verification: 'delivered' }),
        milestone({ id: MAINTENANCE_MILESTONE_ID, title: 'Maintenance', status: 'running', dispatch: dispatch({ id: 'loop-maint', lastRunAt: '2026-09-14T08:00:00.000Z' }) }),
      ],
    });

    expect(projectActivity(record, RUNNING_SESSION)).toMatchObject({ state: 'complete', headline: 'Delivered', owner: 'Maintenance is waiting for a trigger' });
    // Accepted work that waits for its release step is not delivered yet.
    const releasing = { ...record, phase: 'release' as const, milestones: [record.milestones[0]!] };
    expect(projectActivity(releasing, RUNNING_SESSION).headline).toBe('1 of 1 milestones accepted');
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

  it('counts a milestone set aside when its Room stopped as accepted, but never as evidence', () => {
    const delivered = milestone({ id: 'm1', status: 'done', verification: 'delivered', receipt: 'pr-1' });
    const aside = milestone({ id: 'm2', status: 'parked', parkedBy: null, parkedFrom: 'approved' });
    const agreement = { revision: 1, capUsd: 5, proposedAt: T0, approvedAt: T0, authority: { policyId: 'policy-1', workspaceId: 'ws-1', roles: {}, maxLiveSessions: 8, maxTotalSessions: 64 } };
    const record = project({ phase: 'maintain', agreement, milestones: [delivered, aside] });

    // Set aside is closed work, so it no longer holds the plan open.
    expect(milestoneCounts(record)).toEqual({ accepted: 2, total: 2 });
    expect(projectActivity(record, RUNNING_SESSION)).toMatchObject({ state: 'complete', headline: '1 of 2 delivered, 1 set aside' });

    // A plan of nothing but set-aside work proves nothing, so it is not delivered.
    const abandoned = project({ phase: 'maintain', agreement, milestones: [aside] });
    expect(milestoneCounts(abandoned)).toEqual({ accepted: 1, total: 1 });
    expect(projectActivity(abandoned, RUNNING_SESSION).state).not.toBe('complete');
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

describe('the owner line for work the Architect does itself', () => {
  it('names the milestone while the owner works on it', () => {
    const direct = milestone({ title: 'Add keyboard paging', direct: { id: 'd1', runId: null, owner: { subject: 'owner', sessionId: null, sessionPath: null }, placement: { mode: 'workspace', directory: '/p', workspaceId: null }, baseCommit: null, baseFingerprint: null, requirementRevision: null, state: 'running', startedAt: T0, claim: null, continuations: 0, idleContinuations: 0 } });
    const base = project({ milestones: [direct] });
    const inTurn = { ...base, session: { ...base.session, workingSince: '2026-09-19T10:05:00.000Z' } };
    expect(projectActivity(inTurn, RUNNING_SESSION).owner).toBe('Architect is doing Add keyboard paging');
  });
});
