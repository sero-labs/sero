/**
 * Project feedback: what the owner, direct research and linked Orchestrator
 * work report while they run. Metadata only, and it reaches a reader before
 * the work completes.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { feedbackActivity, ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY, type OrchestratorRoomHandle, type WorkFeedback } from '@sero-ai/common';
import { feedbackByProject, observedActivity, projectFeedback } from '../../shared/feedback';
import { projectActivity } from '../../shared/activity';
import { createTurnOutcomes } from '../turn-outcomes';
import { OwnerSessions } from '../owner-session';
import { readAllProjectFeedback, readProjectFeedback } from '../project-feedback';
import { runProjectModel } from '../project-usage';
import { buildingProject, cleanupHosts, fakeHost, FEEDBACK_EPOCH, milestone, roomHandle, storeFor, T0 } from './helpers';

afterEach(() => {
  cleanupHosts();
  Reflect.deleteProperty(globalThis, ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY);
});

const params = { task: 'Inspect', parentSessionId: 'parent', workspaceId: 'ws-1' };

function linked(key: string, projectId: string | undefined, over: Partial<WorkFeedback> = {}): WorkFeedback {
  return {
    key, kind: 'room-member', owner: key, scope: { appId: 'orchestrator', workspaceId: 'ws-1', workId: 'room-1', ...(projectId ? { projectId } : {}) },
    epoch: FEEDBACK_EPOCH, revision: 1, turnId: 't1', attached: true, wait: { kind: 'tool', toolName: 'bash', since: T0 }, openCalls: 1,
    lastActivityAt: T0, contactObservedAt: T0, terminal: null, ...over,
  };
}

function register(workspaceId: string, handle: Partial<OrchestratorRoomHandle>) {
  (globalThis as Record<string, unknown>)[ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY] = new Map([[workspaceId, { handle: roomHandle(handle) }]]);
}

describe('direct research feedback', () => {
  it('reports the open request before the run returns, then its real end', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const record = buildingProject({ pendingResearch: [{ id: 'r1', question: 'q', stoppingCondition: 'answer', startedAt: T0 }] });
    await store.write(record);
    let during: WorkFeedback[] = [];
    host.runStructured = async (request) => {
      request.onObservation?.({ kind: 'operation-start', identities: { operationId: 'run-1' }, startedAt: T0 });
      request.onObservation?.({ kind: 'request-start', identities: { operationId: 'sub-1', requestId: 'req-1' }, startedAt: T0, model: 'p/m' });
      during = host.feedback.list();
      return { response: 'done', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, costUsd: 0.1 } };
    };
    await runProjectModel({ host, store }, record, { kind: 'research', id: 'r1' }, params);

    expect(during).toHaveLength(1);
    expect(during[0]).toMatchObject({ kind: 'research', wait: { kind: 'request', model: 'p/m' }, scope: { projectId: record.id, workId: 'r1' } });
    expect(feedbackActivity(during[0], FEEDBACK_EPOCH)).toBe('working');
    expect(feedbackActivity(host.feedback.list()[0], FEEDBACK_EPOCH)).toBe('complete');
  });

  it('keeps a failed run a failure, not silence', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const record = buildingProject({ pendingResearch: [{ id: 'r1', question: 'q', stoppingCondition: 'answer', startedAt: T0 }] });
    await store.write(record);
    host.runStructured = async () => { throw new Error('lost response'); };
    await runProjectModel({ host, store }, record, { kind: 'research', id: 'r1' }, params);
    expect(host.feedback.list()[0].terminal).toMatchObject({ outcome: 'failed' });
  });
});

describe('owner feedback', () => {
  it('reports the owner turn while it runs and stops claiming contact when it ends', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const outcomes = createTurnOutcomes();
    const record = buildingProject({ milestones: [milestone('m1')] });
    await store.write(record);
    const sessions = new OwnerSessions({ host, store, outcomes });
    let during: WorkFeedback | undefined;
    host.sessions.onTurn = async (handleId) => {
      host.sessions.emit(handleId, { type: 'turn_start', turnId: 'turn-1', at: T0 });
      host.sessions.emit(handleId, { type: 'tool_start', toolName: 'architect', summary: 'SECRET ARGS', callId: 'c1', at: T0 });
      [during] = host.feedback.list();
      outcomes.declare(record.id, 'sleep');
    };
    await sessions.runTurn(record, { kind: 'quiet', at: T0, items: ['wake'] });

    expect(during).toMatchObject({ kind: 'owner-wake', owner: 'Architect', attached: true, wait: { kind: 'tool', toolName: 'architect' }, scope: { projectId: record.id } });
    expect(JSON.stringify(during)).not.toContain('SECRET');
    expect(host.feedback.list()[0].attached).toBe(false);
  });
});

describe('a project reads its own and its linked work', () => {
  it('keeps linked work recorded under this project and leaves the rest out', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const record = buildingProject({ milestones: [milestone('m1')] });
    await store.write(record);
    register(record.workspaceId!, { feedback: async () => ({ epoch: FEEDBACK_EPOCH, snapshots: [
      linked('member:room-1:m1', record.id),
      linked('member:room-9:m1', 'another-project'),
      // Same workspace, similar work, no recorded project: never guessed in.
      linked('member:room-7:m1', undefined),
    ] }) });

    const reply = await readProjectFeedback({ host, store }, record.id);
    expect(reply.snapshots.map((entry) => entry.key)).toEqual(['member:room-1:m1']);
  });

  it('drops linked work from a runtime of another session', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const record = buildingProject({ milestones: [milestone('m1')] });
    await store.write(record);
    register(record.workspaceId!, { feedback: async () => ({ epoch: '2026-01-01T00:00:00.000Z', snapshots: [linked('member:room-1:m1', record.id)] }) });
    expect((await readProjectFeedback({ host, store }, record.id)).snapshots).toEqual([]);
  });
});

describe('project activity from observed work', () => {
  const dispatched = () => buildingProject({ milestones: [milestone('m1', { status: 'running', dispatch: { kind: 'room', id: 'room-1', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: null } })] });

  it('reads working from an attached member before any record write says so', () => {
    const record = dispatched();
    const options = { sessionStartedAt: FEEDBACK_EPOCH, runtimeRunning: true };
    expect(projectActivity(record, options).state).toBe('last-known');
    const feedback = projectFeedback([linked('member:room-1:m1', record.id)], record.id, FEEDBACK_EPOCH);
    expect(projectActivity(record, { ...options, feedback }).state).toBe('working');
  });

  it('does not count the owner turn as delegated work, and names two members as two', () => {
    const record = dispatched();
    expect(projectFeedback([linked('owner', record.id, { kind: 'owner-wake' })], record.id, FEEDBACK_EPOCH)).toBeNull();
    const two = projectFeedback([linked('a', record.id), linked('b', record.id, { wait: null })], record.id, FEEDBACK_EPOCH);
    expect(two?.activeCount).toBe(2);
    expect(two?.current.map((entry) => entry.key)).toEqual(['a', 'b']);
  });

  it('goes back to last known when the producer is lost', () => {
    const record = dispatched();
    const feedback = projectFeedback([linked('member:room-1:m1', record.id, { attached: false, wait: null })], record.id, FEEDBACK_EPOCH);
    expect(projectActivity(record, { sessionStartedAt: FEEDBACK_EPOCH, runtimeRunning: true, feedback }).state).toBe('last-known');
  });
});

describe('a list of projects', () => {
  const lastKnown = { state: 'last-known' as const, headline: 'Last known: working on Parser', owner: 'No live report from the Room' };

  it('reads every project in one call and loads no project record', async () => {
    const host = await fakeHost();
    register('ws-1', { feedback: async () => ({ epoch: FEEDBACK_EPOCH, snapshots: [linked('a', 'proj-a'), linked('b', 'proj-b'), linked('c', undefined)] }) });
    const reply = await readAllProjectFeedback({ host });
    const work = feedbackByProject(reply.snapshots, reply.epoch);
    expect([...work.keys()].sort()).toEqual(['proj-a', 'proj-b']);
  });

  it('turns a row saved as last known into working while its workers report, and names them', () => {
    const work = feedbackByProject([linked('Adversary', 'proj-a'), linked('Conductor', 'proj-a')], FEEDBACK_EPOCH);
    expect(observedActivity(lastKnown, work.get('proj-a'))).toMatchObject({ state: 'working', owner: 'Adversary, Conductor' });
    expect(observedActivity(lastKnown, work.get('proj-b'))).toBe(lastKnown);
  });

  it('never overrides a row that needs the user or was paused', () => {
    const work = feedbackByProject([linked('Adversary', 'proj-a')], FEEDBACK_EPOCH);
    const waiting = { state: 'waiting-for-you' as const, headline: 'Decide the cap', owner: 'Architect', action: 'Raise the cap' };
    expect(observedActivity(waiting, work.get('proj-a'))).toBe(waiting);
  });
});
