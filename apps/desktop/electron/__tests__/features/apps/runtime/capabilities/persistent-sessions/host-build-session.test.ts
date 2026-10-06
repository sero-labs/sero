/**
 * What the host actually hands Pi when it builds a member session.
 *
 * The permission profile is the second filter, and the approval dialog
 * described the profile — so the session must run the list the builder returned,
 * not the list the request asked for. The builder also needs to know WHICH
 * member it is building for: the CLI command surface is scoped per session, and
 * a member with no scope of its own reads whichever chat happens to be open.
 */

import { mkdir, mkdtemp, realpath } from 'fs/promises';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PersistentSessionGrantProposal, PersistentSessionSubjectPolicy } from '@sero-ai/common';

import { PersistentSessionHost } from '@electron/features/apps/runtime/capabilities/persistent-sessions/host';
import { GrantStore } from '@electron/features/apps/runtime/capabilities/persistent-sessions/grant-store';

const createAgentSession = vi.fn(async (_options: Record<string, unknown>) => ({
  session: fakeSession(),
}));

vi.mock('@earendil-works/pi-coding-agent', () => ({
  Theme: class {},
  createAgentSession: (options: Record<string, unknown>) => createAgentSession(options),
  SessionManager: {
    create: () => sessionManager,
    open: () => sessionManager,
  },
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
  return trackedSession();
}

/**
 * A session that records its extension lifecycle. The real session carries an
 * agent, and buildSession wraps its afterToolCall.
 */
function trackedSession() {
  const tracked = {
    agent: {},
    subscribe: () => () => undefined,
    lifecycle: [] as string[],
    get disposed() { return tracked.lifecycle.includes('dispose'); },
    bindExtensions: async () => { tracked.lifecycle.push('session_start'); },
    extensionRunner: {
      emit: async (event: { type: string }) => {
        await Promise.resolve();
        tracked.lifecycle.push(event.type);
      },
    },
    abort: async () => undefined,
    dispose: () => {
      tracked.lifecycle.push('dispose');
      return undefined;
    },
  };
  return tracked;
}

const MODEL = 'anthropic/claude-opus-5';

function policy(cwd: string): PersistentSessionSubjectPolicy {
  return {
    allowedCwds: [cwd],
    allowedModels: [MODEL],
    // The blueprint asked for `write`; the profile below does not allow it.
    allowedTools: ['read', 'write', 'sero-cli'],
    allowedSkills: [],
    allowedThinkingLevels: ['low'],
    permissionProfile: { filesystem: 'read', commands: 'none', network: 'none', vcs: 'read' },
    maxSystemPromptAdditionBytes: 1000,
  };
}

/** The list the builder returns — already filtered by the approved profile. */
const BUILT_TOOLS = ['read', 'sero-cli'];

async function hostWithGrant(builtInputs: { tools: string[]; initialTools?: string[] } = { tools: BUILT_TOOLS }) {
  const tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sero-member-session-')));
  const cwd = path.join(tmp, 'repo');
  await mkdir(cwd, { recursive: true });

  const buildSessionInputs = vi.fn(async () => builtInputs);
  let counter = 0;
  const host = new PersistentSessionHost({
    appId: 'sero-orchestrator-plugin',
    grantStore: new GrantStore({
      persistence: { read: async () => null, write: async () => undefined },
      now: () => '2026-08-14T00:00:00.000Z',
      newId: (prefix) => `${prefix}-${(counter += 1)}`,
    }),
    resolveSessionDir: (grantId) => path.join(tmp, 'sessions', grantId),
    approveGrant: async (proposal: PersistentSessionGrantProposal) => ({
      approvalId: 'approval-1',
      approved: proposal,
    }),
    listAvailableModelIds: async () => new Set([MODEL]),
    defaultThinking: () => 'low',
    buildSessionInputs,
    resolveModel: async () => ({ id: MODEL }) as never,
    newId: (prefix) => `${prefix}-${(counter += 1)}`,
    log: () => undefined,
  });

  const grant = await host.requestGrant({
    owner: 'room-1',
    scope: 'members',
    workspaceId: 'ws-1',
    subjects: { implementer: policy(cwd) },
    maxLiveSessions: 1,
    maxTotalSessions: 1,
    reason: 'Run a Room team',
  });
  sessionFile = path.join(tmp, 'sessions', grant.grantId, 'session-1.jsonl');
  await mkdir(path.dirname(sessionFile), { recursive: true });

  const created = await host.create({
    grantId: grant.grantId,
    subject: 'implementer',
    operation: 'create',
    cwd,
    model: MODEL,
    thinking: 'low',
    tools: ['read', 'write', 'sero-cli'],
    skills: [],
    systemPromptAdditions: [],
    sessionName: 'Room — implementer',
  });

  return { buildSessionInputs, grantId: grant.grantId, created, host, cwd };
}

/** The same request `hostWithGrant` created with, for reopening that subject. */
function openRequest(cwd: string, grantId: string) {
  return {
    grantId,
    subject: 'implementer',
    operation: 'open' as const,
    cwd,
    model: MODEL,
    thinking: 'low',
    tools: ['read', 'write', 'sero-cli'],
    skills: [],
    systemPromptAdditions: [],
    sessionName: 'Room — implementer',
  };
}

describe('member session assembly', () => {
  beforeEach(() => {
    createAgentSession.mockClear();
    createAgentSession.mockImplementation(async () => ({ session: fakeSession() }));
  });

  it('runs the tools the profile left, not the tools the request asked for', async () => {
    await hostWithGrant();

    const options = createAgentSession.mock.calls[0]?.[0] ?? {};
    expect(options.tools).toEqual(BUILT_TOOLS);
    // Without this the built-in tools stay on and the allowlist means nothing.
    expect(options.noTools).toBe('builtin');
  });

  it('narrows the declared tools to the loadout when the builder defers some', async () => {
    const setActiveToolsByName = vi.fn();
    createAgentSession.mockImplementation(async () => ({ session: { ...fakeSession(), setActiveToolsByName } }));

    await hostWithGrant({ tools: ['read', 'sero-cli', 'tool_search'], initialTools: ['read', 'tool_search'] });

    // The registered list reaches Pi whole, and the loadout is what is declared.
    expect(createAgentSession.mock.calls.at(-1)?.[0].tools).toEqual(['read', 'sero-cli', 'tool_search']);
    expect(setActiveToolsByName).toHaveBeenCalledWith(['read', 'tool_search']);
  });

  it('tells the builder which member it is building for', async () => {
    const { buildSessionInputs, grantId } = await hostWithGrant();

    expect(buildSessionInputs).toHaveBeenCalledWith(
      // The grant's workspace travels with it: a global runtime proposes
      // sessions for a real workspace, and the CLI must be scoped to that one.
      expect.objectContaining({ grantId, subject: 'implementer', workspaceId: 'ws-1' }),
    );
  });
});

describe('reopening while the grant is revoked', () => {
  beforeEach(() => {
    createAgentSession.mockClear();
    createAgentSession.mockImplementation(async () => ({ session: fakeSession() }));
  });

  it('disposes a session that finished building after its grant was revoked', async () => {
    const { host, cwd, grantId, created } = await hostWithGrant();
    // Free the live slot so the next call really reopens instead of handing
    // back the session that is already open for this subject.
    await host.dispose(created.handleId);

    // Hold construction open, so revocation lands while the session is being
    // built — the window where it is in neither the live set nor the store.
    const building = trackedSession();
    let finishBuild = (): void => undefined;
    let buildStarted = (): void => undefined;
    const underConstruction = new Promise<void>((resolve) => { buildStarted = resolve; });
    createAgentSession.mockImplementation(async () => {
      buildStarted();
      return new Promise((resolve) => {
        finishBuild = () => resolve({ session: building });
      });
    });

    const reopening = host.open(openRequest(cwd, grantId));
    // Revoking only proves anything once construction is genuinely under way:
    // revoked any earlier and `open` refuses at the reservation instead.
    await underConstruction;

    await host.revokeGrant(grantId);
    finishBuild();

    // Revocation could not dispose a session that was not registered yet, so
    // `open` must dispose it rather than add it under a revoked grant.
    await expect(reopening).rejects.toThrow(/grant-revoked/);
    expect(building.lifecycle).toEqual(['session_start', 'session_shutdown', 'dispose']);
  });
});

describe('member session extension lifecycle', () => {
  let built: Array<ReturnType<typeof trackedSession>> = [];

  beforeEach(() => {
    built = [];
    createAgentSession.mockClear();
    createAgentSession.mockImplementation(async () => {
      const session = trackedSession();
      built.push(session);
      return { session };
    });
  });

  it('starts extensions with the startup reason, and ends them before dispose', async () => {
    const { host, created } = await hostWithGrant();

    await host.dispose(created.handleId);

    expect(createAgentSession.mock.calls[0]?.[0]?.sessionStartEvent)
      .toEqual({ type: 'session_start', reason: 'startup' });
    expect(built[0]?.lifecycle).toEqual(['session_start', 'session_shutdown', 'dispose']);
  });

  it('ends the extensions of every live session when the grant is revoked', async () => {
    const { host, grantId } = await hostWithGrant();

    await host.revokeGrant(grantId);

    expect(built[0]?.lifecycle).toEqual(['session_start', 'session_shutdown', 'dispose']);
  });
});
