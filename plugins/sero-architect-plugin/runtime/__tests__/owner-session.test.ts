import { afterEach, describe, expect, it } from 'vitest';
import { OwnerSessions, OWNER_TOOLS, ownerGrantProposal } from '../owner-session';
import { createTurnOutcomes } from '../turn-outcomes';
import { buildingProject, cleanupHosts, fakeHost, storeFor, T0 } from './helpers';

afterEach(cleanupHosts);

const wake = { kind: 'quiet' as const, at: T0, items: ['nothing is running'] };

describe('owner session', () => {
  it('proposes a grant naming only the platform tools and sero-cli, pinned to the project folder', () => {
    const proposal = ownerGrantProposal(buildingProject(), { model: 'anthropic/claude-fable-5-1', thinking: 'medium' });
    expect(proposal.workspaceId).toBe('ws-1');
    expect(proposal.maxLiveSessions).toBe(1);
    const owner = proposal.subjects.owner!;
    expect(owner.allowedTools).toEqual([...OWNER_TOOLS]);
    expect(owner.allowedTools).not.toContain('orchestrator');
    expect(owner.allowedTools).not.toContain('rooms');
    expect(owner.allowedTools).not.toContain('subagent');
    expect(owner.allowedCwds).toEqual(['/home/dan/projects/hollow']);
    expect(owner.permissionProfile.vcs).toBe('commit');
  });

  it('blocks the project with the reason when the user refuses the grant', async () => {
    const host = await fakeHost();
    host.sessions.denyGrant = true;
    const store = await storeFor(host);
    const sessions = new OwnerSessions({ host, store, outcomes: createTurnOutcomes() });
    const record = await sessions.requestGrant({ ...buildingProject(), session: { ...buildingProject().session, grantId: null } });
    expect(record.overlay).toBe('blocked');
    expect(record.blockedReason).toContain('grant was not approved');
    expect(record.blockedReason).toContain('the user declined');
  });

  it('sends the contract as the first prompt of a wake and re-sends it after compaction', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const outcomes = createTurnOutcomes();
    const sessions = new OwnerSessions({ host, store, outcomes });
    const record = buildingProject();
    await store.write(record);
    host.sessions.onTurn = async (handleId) => {
      host.sessions.emit(handleId, { type: 'compacted' });
      outcomes.declare('proj_1', 'sleep');
    };
    const result = await sessions.runTurn(record, wake);
    expect(host.sessions.requests[0]).toMatchObject({ operation: 'open', cwd: '/home/dan/projects/hollow', tools: [...OWNER_TOOLS], grantId: 'grant-1' });
    expect(host.sessions.prompts[0]?.content).toContain('This contract replaces every earlier Architect contract');
    expect(host.sessions.prompts[0]?.content).toContain('nothing is running');
    expect(host.sessions.steers[0]?.content).toBe(host.sessions.prompts[0]?.content);
    expect(result.declared).toBe('sleep');
    expect(result.record.session.silentTurns).toBe(0);
    expect(result.record.session.lastWakeKind).toBe('quiet');
  });

  it('charges only the delta of the session cost to the owner source', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const outcomes = createTurnOutcomes();
    const sessions = new OwnerSessions({ host, store, outcomes });
    await store.write(buildingProject());
    host.sessions.onTurn = async () => outcomes.declare('proj_1', 'sleep');
    host.sessions.costUsd = 1.5;
    const first = await sessions.runTurn(buildingProject(), wake);
    expect(first.record.budget.sources.owner).toBe(1.5);
    host.sessions.costUsd = 2.25;
    const second = await sessions.runTurn(first.record, wake);
    expect(second.record.budget.sources.owner).toBe(2.25);
    expect(second.record.budget.spentUsd).toBe(2.25);
  });

  it('blocks the project after three turns that end without an outcome', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const sessions = new OwnerSessions({ host, store, outcomes: createTurnOutcomes() });
    let record = buildingProject();
    await store.write(record);
    host.sessions.onTurn = async () => undefined;
    for (let i = 0; i < 2; i += 1) {
      record = (await sessions.runTurn(record, wake)).record;
      expect(record.overlay).toBeNull();
      expect(record.session.silentTurns).toBe(i + 1);
    }
    record = (await sessions.runTurn(record, wake)).record;
    expect(record.overlay).toBe('blocked');
    expect(record.blockedReason).toContain('3 turns in a row without declaring an outcome');
  });
});
