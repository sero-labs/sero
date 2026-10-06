/**
 * Amending a grant that exists: contained changes apply, added authority waits
 * for the user, and nothing that matters about the grant is replaced.
 */

import { describe, expect, it, vi } from 'vitest';

import type { PersistentSessionGrantAmendment, PersistentSessionSubjectPolicy } from '@sero-ai/common';

import { PersistentSessionHost } from '@electron/features/apps/runtime/capabilities/persistent-sessions/host';
import { validatePersistentSessionRequest } from '@electron/features/apps/runtime/capabilities/persistent-sessions/validate';

import {
  IMPLEMENTER_FILE, issueWithSession, createPersistence, createStore, policy, proposal, storedGrant,
} from './grant-store.fixtures';

vi.mock('@earendil-works/pi-coding-agent', () => ({
  Theme: class {},
  createAgentSession: vi.fn(),
  SessionManager: { create: vi.fn(), open: vi.fn() },
}));

const writer = (): PersistentSessionSubjectPolicy => ({
  ...policy(),
  allowedTools: ['read', 'write'],
  permissionProfile: { filesystem: 'write', commands: 'none', network: 'none', vcs: 'read' },
});

function setup(options: { approve?: (expansion: unknown) => Promise<boolean> } = {}) {
  const fake = createPersistence();
  const store = createStore(fake.persistence);
  const approveExpansion = vi.fn(async (_reason: string, expansion: unknown) => (options.approve ? options.approve(expansion) : true));
  const host = new PersistentSessionHost({
    appId: 'orchestrator',
    grantStore: store,
    resolveSessionDir: () => '/sessions/rooms/room-1',
    approveGrant: async (asked) => ({ approvalId: 'approval-1', approved: asked }),
    clampSubjects: async (_workspaceId, subjects) => subjects,
    approveExpansion,
    listAvailableModelIds: async () => new Set<string>(),
    defaultThinking: () => 'low',
    buildSessionInputs: async () => ({}),
    resolveModel: async () => undefined,
    newId: (prefix) => `${prefix}-x`,
    log: () => undefined,
  });
  return { fake, store, host, approveExpansion };
}

async function grantWith(ctx: ReturnType<typeof setup>, overrides = {}) {
  await ctx.store.initialize();
  return ctx.store.issue('orchestrator', () => '/sessions/rooms/room-1', 'approval-1', proposal(overrides));
}

const amend = (grantId: string, extra: Partial<PersistentSessionGrantAmendment> = {}): PersistentSessionGrantAmendment => ({
  grantId, amendmentId: 'amend-1', expectedRevision: 0, reason: 'Widen the reviewer', ...extra,
});

describe('grant amendments', () => {
  it('applies a change inside the approval without asking', async () => {
    const ctx = setup();
    const grant = await grantWith(ctx);
    const narrower = { ...policy(), allowedTools: [] };
    const result = await ctx.host.amendGrant(amend(grant.grantId, { subjects: { reviewer: narrower } }));

    expect(result).toMatchObject({ status: 'applied', revision: 1, approvedByUser: false });
    expect(ctx.approveExpansion).not.toHaveBeenCalled();
    expect(storedGrant(ctx.fake, grant.grantId).subjects.reviewer.allowedTools).toEqual([]);
  });

  it('holds added authority and changes nothing', async () => {
    const ctx = setup();
    const grant = await grantWith(ctx);
    const result = await ctx.host.amendGrant(amend(grant.grantId, { subjects: { reviewer: writer() } }));

    expect(result).toMatchObject({ status: 'needs-approval', revision: 0 });
    expect(result.status === 'needs-approval' && result.expansion.map((item: { field: string }) => item.field)).toContain('tool');
    expect(ctx.approveExpansion).not.toHaveBeenCalled();
    expect(storedGrant(ctx.fake, grant.grantId).subjects.reviewer.allowedTools).toEqual(['read']);
  });

  it('asks the user for exactly the addition, then applies on yes', async () => {
    const ctx = setup();
    const grant = await grantWith(ctx);
    const result = await ctx.host.amendGrant(amend(grant.grantId, { approval: 'ask', subjects: { reviewer: writer() } }));

    expect(result).toMatchObject({ status: 'applied', approvedByUser: true, revision: 1 });
    expect(ctx.approveExpansion).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(ctx.approveExpansion.mock.calls[0][1])).toContain('write');
  });

  it('changes nothing on no, and a repeat gets the same answer without asking again', async () => {
    const ctx = setup({ approve: async () => false });
    const grant = await grantWith(ctx);
    const request = amend(grant.grantId, { approval: 'ask', subjects: { reviewer: writer() } });

    const first = await ctx.host.amendGrant(request);
    expect(first.status).toBe('declined');
    expect(storedGrant(ctx.fake, grant.grantId).subjects.reviewer.allowedTools).toEqual(['read']);
    expect(await ctx.host.amendGrant(request)).toEqual(first);
    expect(ctx.approveExpansion).toHaveBeenCalledTimes(1);
  });

  it('refuses a change made against an old revision', async () => {
    const ctx = setup();
    const grant = await grantWith(ctx);
    const result = await ctx.host.amendGrant(amend(grant.grantId, { expectedRevision: 3, subjects: { reviewer: { ...policy(), allowedTools: [] } } }));
    expect(result).toMatchObject({ status: 'stale', revision: 0 });
  });

  it('returns the stored result for a repeated id, whatever revision the repeat names, and applies once', async () => {
    const ctx = setup();
    const grant = await grantWith(ctx);
    const request = amend(grant.grantId, { subjects: { reviewer: { ...policy(), allowedTools: [] } } });
    const first = await ctx.host.amendGrant(request);
    const again = await ctx.host.amendGrant({ ...request, expectedRevision: 9 });

    expect(again).toEqual(first);
    expect(storedGrant(ctx.fake, grant.grantId).revision).toBe(1);
  });

  it('refuses an unknown grant', async () => {
    const ctx = setup();
    await ctx.store.initialize();
    expect((await ctx.host.amendGrant(amend('grant-nope', { subjects: { reviewer: policy() } }))).status).toBe('refused');
  });

  it('loses a race with revocation that lands while the user is being asked', async () => {
    let answer: (yes: boolean) => void = () => undefined;
    const ctx = setup({ approve: () => new Promise<boolean>((resolve) => { answer = resolve; }) });
    const grant = await grantWith(ctx);
    const pending = ctx.host.amendGrant(amend(grant.grantId, { approval: 'ask', subjects: { reviewer: writer() } }));
    await vi.waitFor(() => expect(ctx.approveExpansion).toHaveBeenCalled());

    await ctx.host.revokeGrant(grant.grantId);
    answer(true);

    expect((await pending).status).toBe('refused');
    expect(storedGrant(ctx.fake, grant.grantId).subjects.reviewer.allowedTools).toEqual(['read']);
  });

  it('keeps a read-only subject read-only although another role may write', async () => {
    const ctx = setup();
    await ctx.store.initialize();
    const stored = await ctx.store.issuePolicy('architect', 'approval-0', proposal({
      delegation: { delegateAppIds: ['orchestrator'], roles: { researcher: policy(), builder: writer() }, maxLiveSessions: 2, maxTotalSessions: 4 },
    }));
    const grant = await ctx.store.issue('orchestrator', () => '/sessions/rooms/room-1', stored?.approvalId ?? '', proposal(), stored?.policyId);

    const raise = await ctx.host.amendGrant(amend(grant.grantId, { subjects: { reviewer: writer() } }));
    expect(raise.status).toBe('needs-approval');
    // A new subject that fits one whole role is contained.
    const added = await ctx.host.amendGrant(amend(grant.grantId, { amendmentId: 'amend-2', subjects: { builder: writer() } }));
    expect(added.status).toBe('applied');
  });

  it('keeps the grant, directory and session binding, and the retired subject starts no more sessions', async () => {
    const ctx = setup();
    await ctx.store.initialize();
    const grant = await issueWithSession(ctx.store, 'implementer', IMPLEMENTER_FILE, 'handle-1');
    const before = storedGrant(ctx.fake, grant.grantId);
    const result = await ctx.host.amendGrant(amend(grant.grantId, { retire: ['implementer'] }));

    expect(result).toMatchObject({ status: 'applied', retired: ['implementer'] });
    const after = storedGrant(ctx.fake, grant.grantId);
    expect([after.grantId, after.sessionDir, after.sessionPaths]).toEqual([before.grantId, before.sessionDir, before.sessionPaths]);
    expect(after.createdSessions).toBe(1);

    const refused = await ctx.store.reserve(grant.grantId, 'implementer');
    expect(refused).toMatchObject({ ok: false, reason: 'subject-retired' });
    const denied = validatePersistentSessionRequest({
      request: { grantId: grant.grantId, subject: 'implementer', operation: 'open', cwd: '/repo', model: 'anthropic/claude-opus-5', tools: [], skills: [], sessionName: 'x' },
      grant: after, callerAppId: 'orchestrator', registeredSessionPath: IMPLEMENTER_FILE,
      availableModelIds: new Set(['anthropic/claude-opus-5']), defaultThinking: 'low',
    });
    expect(denied).toMatchObject({ ok: false, reason: 'subject-retired' });
    // Lifetime consumption is not handed back: one of two total slots is still spent.
    await ctx.store.reserve(grant.grantId, 'reviewer');
    expect(storedGrant(ctx.fake, grant.grantId).createdSessions).toBe(1);
  });

  it('uses the amended policy from the next request on', async () => {
    const ctx = setup();
    const grant = await grantWith(ctx);
    await ctx.host.amendGrant(amend(grant.grantId, { subjects: { reviewer: { ...policy(), allowedTools: [] } } }));
    const request = { grantId: grant.grantId, subject: 'reviewer', operation: 'create' as const, cwd: '/repo', model: 'anthropic/claude-opus-5', tools: ['read'], skills: [], sessionName: 'x' };
    const result = validatePersistentSessionRequest({
      request, grant: ctx.store.get(grant.grantId), callerAppId: 'orchestrator', registeredSessionPath: null,
      availableModelIds: new Set(['anthropic/claude-opus-5']), defaultThinking: 'low',
    });
    expect(result).toMatchObject({ ok: false, reason: 'tool-not-allowed' });
  });

  it('gives the last total slot to exactly one of two added subjects, and a repeat takes no slot', async () => {
    const ctx = setup();
    const grant = await grantWith(ctx, { subjects: { implementer: policy() }, maxTotalSessions: 1, maxLiveSessions: 2 });
    const add = (id: string, subject: string) =>
      ctx.host.amendGrant(amend(grant.grantId, { amendmentId: id, approval: 'ask', expectedRevision: id === 'a' ? 0 : 1, subjects: { [subject]: policy() } }));
    await add('a', 'alpha');
    await add('b', 'beta');
    await add('a', 'alpha');

    const slots = await Promise.all([ctx.store.reserve(grant.grantId, 'alpha'), ctx.store.reserve(grant.grantId, 'beta')]);
    expect(slots.filter((slot) => slot.ok)).toHaveLength(1);
    expect(slots.find((slot) => !slot.ok)).toMatchObject({ reason: 'total-limit' });
    expect(storedGrant(ctx.fake, grant.grantId).revision).toBe(2);
  });
});
