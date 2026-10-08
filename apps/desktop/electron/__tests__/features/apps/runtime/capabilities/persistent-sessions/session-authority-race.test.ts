/**
 * A session is built between validation and commit. An amendment that retires
 * its subject or narrows its policy in that gap must not leave a session that
 * keeps the removed authority: the host disposes it and says why.
 */

import { mkdir, mkdtemp, realpath } from 'fs/promises';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PersistentSessionGrantProposal, PersistentSessionSubjectPolicy } from '@sero-ai/common';

import { GrantStore } from '@electron/features/apps/runtime/capabilities/persistent-sessions/grant-store';
import { PersistentSessionHost } from '@electron/features/apps/runtime/capabilities/persistent-sessions/host';

const createAgentSession = vi.fn();

vi.mock('@earendil-works/pi-coding-agent', () => ({
  Theme: class {},
  createAgentSession: (options: unknown) => createAgentSession(options),
  SessionManager: { create: () => sessionManager, open: () => sessionManager },
}));

let sessionFile = '';
const sessionManager = {
  getSessionFile: () => sessionFile,
  buildSessionContext: () => ({ messages: [] }),
  getSessionId: () => 'session-1',
  appendSessionInfo: () => undefined,
  getEntries: () => [],
};

function fakeSession() {
  const lifecycle: string[] = [];
  return {
    agent: {},
    lifecycle,
    subscribe: () => () => undefined,
    bindExtensions: async () => undefined,
    extensionRunner: { emit: async () => undefined },
    abort: async () => undefined,
    dispose: () => { lifecycle.push('dispose'); },
  };
}

const MODEL = 'anthropic/claude-opus-5';

function policy(cwd: string, tools: string[]): PersistentSessionSubjectPolicy {
  return {
    allowedCwds: [cwd],
    allowedModels: [MODEL],
    allowedTools: tools,
    allowedSkills: [],
    allowedThinkingLevels: ['low'],
    permissionProfile: { filesystem: 'read', commands: 'none', network: 'none', vcs: 'read' },
    maxSystemPromptAdditionBytes: 1000,
  };
}

async function setup() {
  const tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sero-authority-race-')));
  const cwd = path.join(tmp, 'repo');
  await mkdir(cwd, { recursive: true });
  let counter = 0;
  const store = new GrantStore({
    persistence: { read: async () => null, write: async () => undefined },
    now: () => '2026-08-14T00:00:00.000Z',
    newId: (prefix) => `${prefix}-${(counter += 1)}`,
  });
  const host = new PersistentSessionHost({
    appId: 'orchestrator',
    grantStore: store,
    resolveSessionDir: (grantId) => path.join(tmp, 'sessions', grantId),
    approveGrant: async (proposal: PersistentSessionGrantProposal) => ({ approvalId: 'approval-1', approved: proposal }),
    clampSubjects: async (_workspaceId, subjects) => subjects,
    approveExpansion: async () => false,
    listAvailableModelIds: async () => new Set([MODEL]),
    defaultThinking: () => 'low',
    buildSessionInputs: async () => ({ tools: ['read', 'write'] }),
    resolveModel: async () => ({ id: MODEL }) as never,
    newId: (prefix) => `${prefix}-${(counter += 1)}`,
    log: () => undefined,
  });
  await store.initialize();
  const grant = await host.requestGrant({
    owner: 'room-1',
    scope: 'members',
    workspaceId: 'ws-1',
    subjects: { implementer: policy(cwd, ['read', 'write']), reviewer: policy(cwd, ['read']) },
    maxLiveSessions: 2,
    maxTotalSessions: 4,
    reason: 'Run a Room team',
  });
  sessionFile = path.join(tmp, 'sessions', grant.grantId, 'session-1.jsonl');
  await mkdir(path.dirname(sessionFile), { recursive: true });
  const request = (operation: 'create' | 'open', subject = 'implementer') => ({
    grantId: grant.grantId, subject, operation, cwd, model: MODEL, thinking: 'low',
    tools: ['read'], skills: [], systemPromptAdditions: [], sessionName: 'Room',
  });
  /** Holds the next session build open until `release` runs. */
  const holdBuild = () => {
    let release = () => undefined as void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const session = fakeSession();
    createAgentSession.mockImplementationOnce(async () => { await gate; return { session }; });
    const started = vi.waitFor(() => expect(createAgentSession).toHaveBeenCalled());
    return { session, release, started };
  };
  const amend = (extra: { retire?: string[]; subjects?: Record<string, PersistentSessionSubjectPolicy> }) =>
    host.amendGrant({ grantId: grant.grantId, amendmentId: `a-${Math.random()}`, expectedRevision: 0, reason: 'x', ...extra });
  return { store, host, grant, cwd, request, holdBuild, amend };
}

describe('a session built while its grant is amended', () => {
  beforeEach(() => {
    createAgentSession.mockReset();
    createAgentSession.mockImplementation(async () => ({ session: fakeSession() }));
  });

  it('is not committed for a subject retired during create', async () => {
    const ctx = await setup();
    const build = ctx.holdBuild();
    const created = ctx.host.create(ctx.request('create'));
    const outcome = expect(created).rejects.toThrow('subject-retired');
    await build.started;

    expect(await ctx.amend({ retire: ['implementer'] })).toMatchObject({ status: 'applied' });
    build.release();
    await outcome;

    expect(build.session.lifecycle).toContain('dispose');
    const stored = ctx.store.get(ctx.grant.grantId);
    expect(stored?.sessionPaths.implementer).toBeUndefined();
    expect(stored?.createdSessions).toBe(0);
    expect(ctx.store.liveHandles(ctx.grant.grantId)).toEqual([]);
  });

  it('is not committed when its policy is narrowed during create, and a retry gets the new policy', async () => {
    const ctx = await setup();
    const build = ctx.holdBuild();
    const created = ctx.host.create(ctx.request('create'));
    const outcome = expect(created).rejects.toThrow('grant-changed');
    await build.started;

    expect(await ctx.amend({ subjects: { implementer: policy(ctx.cwd, ['read']) } })).toMatchObject({ status: 'applied' });
    build.release();
    await outcome;

    expect(build.session.lifecycle).toContain('dispose');
    expect(ctx.store.get(ctx.grant.grantId)?.createdSessions).toBe(0);
    // The next attempt validates against the narrowed policy and succeeds.
    await expect(ctx.host.create(ctx.request('create'))).resolves.toMatchObject({ subject: 'implementer' });
  });

  it('is not registered for a subject retired or narrowed during open', async () => {
    for (const kind of ['retire', 'narrow'] as const) {
      const ctx = await setup();
      const first = await ctx.host.create(ctx.request('create'));
      await ctx.host.dispose(first.handleId);
      createAgentSession.mockClear();

      const build = ctx.holdBuild();
      const opened = ctx.host.open(ctx.request('open'));
      const outcome = expect(opened).rejects.toThrow(/subject-retired|grant-changed/);
      await build.started;
      await ctx.amend(kind === 'retire' ? { retire: ['implementer'] } : { subjects: { implementer: policy(ctx.cwd, ['read']) } });
      build.release();
      await outcome;

      expect(build.session.lifecycle).toContain('dispose');
      expect(ctx.store.liveHandles(ctx.grant.grantId)).toEqual([]);
    }
  });

  it('is not disturbed by an amendment to another subject', async () => {
    const ctx = await setup();
    const build = ctx.holdBuild();
    const created = ctx.host.create(ctx.request('create'));
    await build.started;

    await ctx.amend({ retire: ['reviewer'] });
    build.release();

    await expect(created).resolves.toMatchObject({ subject: 'implementer' });
  });
});
