/**
 * One approval covers the grants a project starts later, and nothing more.
 *
 * Three seams: the pure containment check, the store's shared capacity and
 * revocation, and the host's refusal of a revoked policy. The dialog path is
 * covered in wiring.test.ts.
 */

import { describe, expect, it, vi } from 'vitest';

import type { PersistentSessionGrantProposal, PersistentSessionSubjectPolicy } from '@sero-ai/common';

import {
  fitsDelegationPolicy,
  type DelegationLink,
} from '@electron/features/apps/runtime/capabilities/persistent-sessions/delegation-policy';
import { PersistentSessionHost } from '@electron/features/apps/runtime/capabilities/persistent-sessions/host';
import type { GrantStore, StoredDelegationPolicy } from '@electron/features/apps/runtime/capabilities/persistent-sessions/grant-store';

import { createFiles, createPersistence, createStore, policy, proposal, reserved, SESSION_DIR } from './grant-store.fixtures';

vi.mock('@earendil-works/pi-coding-agent', () => ({
  Theme: class {},
  createAgentSession: vi.fn(),
  SessionManager: { create: vi.fn(), open: vi.fn() },
}));

const reader = (): PersistentSessionSubjectPolicy => policy();
const builder = (): PersistentSessionSubjectPolicy => ({
  ...policy(),
  allowedTools: ['read', 'write', 'bash'],
  permissionProfile: { filesystem: 'write', commands: 'all', network: 'none', vcs: 'commit' },
});

/** A project approval: two roles, three sessions at once, six in total, for the Orchestrator. */
function delegated(overrides: Partial<PersistentSessionGrantProposal['delegation']> = {}): PersistentSessionGrantProposal {
  return proposal({
    owner: 'architect',
    scope: 'proj-1',
    subjects: { owner: reader() },
    delegation: {
      delegateAppIds: ['orchestrator'],
      roles: { researcher: reader(), builder: builder() },
      maxLiveSessions: 3,
      maxTotalSessions: 6,
      ...overrides,
    },
  });
}

async function storeWithPolicy(overrides: Partial<PersistentSessionGrantProposal['delegation']> = {}) {
  const fake = createPersistence();
  const store = createStore(fake.persistence);
  await store.initialize();
  const issued = await store.issuePolicy('architect', 'approval-1', delegated(overrides));
  if (!issued) throw new Error('expected a policy');
  return { fake, store, policy: issued };
}

const link = (stored: StoredDelegationPolicy, callerAppId = 'orchestrator'): DelegationLink => ({ policy: stored, callerAppId });

const roomGrant = (store: GrantStore, policyId: string, overrides: Partial<PersistentSessionGrantProposal> = {}) =>
  store.issue('orchestrator', () => SESSION_DIR, 'approval-1', proposal(overrides), policyId);

describe('containment in a delegation policy', () => {
  it('accepts a linked Room whose members each fit inside one approved role', async () => {
    const { policy: stored } = await storeWithPolicy();
    const room = proposal({ subjects: { reviewer: reader(), implementer: builder() } });
    expect(fitsDelegationPolicy(room, link(stored))).toEqual({ ok: true });
  });

  it.each<[string, Partial<PersistentSessionGrantProposal>, string?]>([
    ['another app', {}, 'some-plugin'],
    ['another workspace', { workspaceId: 'ws-2' }],
    ['a model that was not approved', { subjects: { m: { ...reader(), allowedModels: ['openai/gpt-6'] } } }],
    ['a tool that was not approved', { subjects: { m: { ...builder(), allowedTools: ['read', 'gh'] } } }],
    ['a wider permission profile', { subjects: { m: { ...builder(), permissionProfile: { ...builder().permissionProfile, vcs: 'push' } } } }],
    ['a directory outside the approved one', { subjects: { m: { ...reader(), allowedCwds: ['/elsewhere'] } } }],
    ['more live sessions than approved', { maxLiveSessions: 4 }],
    ['more sessions than the policy has left', { maxTotalSessions: 7 }],
  ])('does not cover %s', async (_name, overrides, callerAppId) => {
    const { policy: stored } = await storeWithPolicy();
    expect(fitsDelegationPolicy(proposal(overrides), link(stored, callerAppId)).ok).toBe(false);
  });

  it('does not let a read-only approval cover a subject that writes', async () => {
    const { policy: stored } = await storeWithPolicy({ roles: { researcher: reader() } });
    expect(fitsDelegationPolicy(proposal({ subjects: { m: builder() } }), link(stored)).ok).toBe(false);
  });

  it('checks a subject against one role, never the union of roles', async () => {
    // Reads with one role's tool and holds the other role's profile: no role allows both.
    const narrow = { ...builder(), allowedTools: ['write'] };
    const { policy: stored } = await storeWithPolicy({ roles: { researcher: { ...reader(), allowedTools: ['gh'] }, builder: narrow } });
    const mixed = { ...builder(), allowedTools: ['gh', 'write'] };
    expect(fitsDelegationPolicy(proposal({ subjects: { m: mixed } }), link(stored)).ok).toBe(false);
  });
});

describe('GrantStore — delegation policies', () => {
  it('stores each role apart and gives a directly approved grant no delegation link', async () => {
    const { fake, store, policy: stored } = await storeWithPolicy();
    const direct = await store.issue('architect', () => SESSION_DIR, 'approval-1', delegated());

    const saved = fake.storedPolicies()[stored.policyId];
    expect(saved.roles.researcher.permissionProfile.filesystem).toBe('read');
    expect(saved.roles.builder.permissionProfile.filesystem).toBe('write');
    expect(direct.delegatedBy).toBeUndefined();
  });

  it('lets two Rooms that start together take the policy allowance once, not once each', async () => {
    const { store, policy: stored } = await storeWithPolicy({ maxLiveSessions: 1 });
    const first = await roomGrant(store, stored.policyId);
    const second = await roomGrant(store, stored.policyId, { owner: 'room-2' });

    const results = await Promise.all([store.reserve(first.grantId, 'implementer'), store.reserve(second.grantId, 'implementer')]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ reason: 'live-limit' });
  });

  it('gives the slot back when creation fails', async () => {
    const { store, policy: stored } = await storeWithPolicy({ maxLiveSessions: 1 });
    const first = await roomGrant(store, stored.policyId);
    const second = await roomGrant(store, stored.policyId, { owner: 'room-2' });

    await store.releaseReservation(first.grantId, await reserved(store, first.grantId, 'implementer'));
    expect((await store.reserve(second.grantId, 'implementer')).ok).toBe(true);
  });

  it('keeps the lifetime count across a restart and rolls back an unfinished creation', async () => {
    const { fake, store, policy: stored } = await storeWithPolicy({ maxTotalSessions: 2 });
    const grant = await roomGrant(store, stored.policyId);
    await store.commitReservation(grant.grantId, await reserved(store, grant.grantId, 'implementer'), 'h1', `${SESSION_DIR}/a.jsonl`);
    await reserved(store, grant.grantId, 'reviewer');

    const restarted = createStore(fake.persistence, createFiles([`${SESSION_DIR}/a.jsonl`]));
    await restarted.initialize();
    // One session was created and one creation never finished: one slot is left, not zero and not two.
    expect((await restarted.reserve(grant.grantId, 'reviewer')).ok).toBe(true);
    expect(await restarted.reserve(grant.grantId, 'third')).toMatchObject({ ok: false, reason: 'total-limit' });
  });

  it('revokes every grant issued under a revoked policy and leaves a direct grant alone', async () => {
    const { store, policy: stored } = await storeWithPolicy();
    const linked = await roomGrant(store, stored.policyId);
    const direct = await store.issue('orchestrator', () => SESSION_DIR, 'approval-2', proposal({ owner: 'room-2' }));

    expect(await store.markPolicyRevoked(stored.policyId)).toEqual([linked.grantId]);
    expect(await store.reserve(linked.grantId, 'implementer')).toMatchObject({ ok: false, reason: 'grant-revoked' });
    expect((await store.reserve(direct.grantId, 'implementer')).ok).toBe(true);
  });

  it('refuses a commit that lost the race with policy revocation', async () => {
    const { store, policy: stored } = await storeWithPolicy();
    const grant = await roomGrant(store, stored.policyId);
    const reservationId = await reserved(store, grant.grantId, 'implementer');

    await store.markPolicyRevoked(stored.policyId);
    expect(await store.commitReservation(grant.grantId, reservationId, 'h1', `${SESSION_DIR}/a.jsonl`))
      .toMatchObject({ ok: false, disposeRequired: true });
  });

  it('issues no grant under a policy revoked while the proposal was checked', async () => {
    const { store, policy: stored } = await storeWithPolicy();
    await store.markPolicyRevoked(stored.policyId);
    await expect(roomGrant(store, stored.policyId)).rejects.toThrow('delegation-policy-revoked');
  });

  it('ends a grant on restart when the crash came between the policy and its grants', async () => {
    const { fake, store, policy: stored } = await storeWithPolicy();
    const grant = await roomGrant(store, stored.policyId);
    // The policy write landed; the grant write did not.
    await fake.persistence.writePolicies?.({ [stored.policyId]: { ...stored, status: 'revoked' } });

    const restarted = createStore(fake.persistence);
    await restarted.initialize();
    expect(restarted.get(grant.grantId)?.status).toBe('revoked');
  });
});

describe('PersistentSessionHost — delegation', () => {
  function hostFor(store: GrantStore, appId: string) {
    const approveGrant = vi.fn(async (asked: PersistentSessionGrantProposal, named?: DelegationLink) => named
      ? { approvalId: named.policy.approvalId, approved: asked, delegatedByPolicyId: named.policy.policyId }
      : { approvalId: 'approval-9', approved: asked });
    const host = new PersistentSessionHost({
      appId,
      grantStore: store,
      resolveSessionDir: () => SESSION_DIR,
      approveGrant,
      listAvailableModelIds: async () => new Set<string>(),
      defaultThinking: () => 'low',
      buildSessionInputs: async () => ({}),
      resolveModel: async () => undefined,
      newId: (prefix) => `${prefix}-x`,
      log: () => undefined,
    });
    return { host, approveGrant };
  }

  it('returns the stored policy with the approved grant, and binds a linked grant to it', async () => {
    const fake = createPersistence();
    const store = createStore(fake.persistence);
    await store.initialize();

    const owner = await hostFor(store, 'architect').host.requestGrant(delegated());
    expect(owner.delegation?.roles.builder.permissionProfile.filesystem).toBe('write');

    const room = await hostFor(store, 'orchestrator').host.requestGrant(proposal({ delegationPolicyId: owner.delegation?.policyId }));
    expect(room.delegatedByPolicyId).toBe(owner.delegation?.policyId);
    // A grant issued under a policy passes nothing on.
    expect(room.delegation).toBeUndefined();
  });

  it('asks the user as usual when the named policy does not exist', async () => {
    const store = createStore(createPersistence().persistence);
    await store.initialize();
    const { host, approveGrant } = hostFor(store, 'orchestrator');

    const room = await host.requestGrant(proposal({ delegationPolicyId: 'policy-made-up' }));
    expect(approveGrant.mock.calls[0][1]).toBeUndefined();
    expect(room.delegatedByPolicyId).toBeUndefined();
  });

  it('refuses a Room queued before the policy was revoked, without asking the user', async () => {
    const { store, policy: stored } = await storeWithPolicy();
    await hostFor(store, 'architect').host.revokeDelegationPolicy(stored.policyId);
    const { host, approveGrant } = hostFor(store, 'orchestrator');

    await expect(host.requestGrant(proposal({ delegationPolicyId: stored.policyId }))).rejects.toThrow('revoked');
    expect(approveGrant).not.toHaveBeenCalled();
  });

  it('lets only the app the policy was issued to revoke it', async () => {
    const { store, policy: stored } = await storeWithPolicy();
    await hostFor(store, 'orchestrator').host.revokeDelegationPolicy(stored.policyId);
    expect(store.getPolicy(stored.policyId)?.status).toBe('active');
  });
});
