import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AppRuntimeContext } from '@sero-ai/common';
import type { OperatingEnvelope } from '../../shared/room-blueprint-types';
import type { Room, RoomMember } from '../../shared/room-types';
import { requestRoomGrant } from '../rooms/member-grant';
import {
  createMemberSessionPool,
  disposeMember,
  memberSessionName,
  reconcileMemberSessions,
  runMemberTurn,
  startMember,
  type MemberSessionDeps,
} from '../rooms/member-session';
import { createRoomObservation } from '../rooms/room-observation';
import { createRoomStore, type RoomStore } from '../rooms/room-store';
import { createFakeHost, type FakeHost } from './fake-host';
import { MEMBERS, envelopeWith, roomFixture } from './room-member-fixtures';

let dir: string;
let host: FakeHost;
let store: RoomStore;
let deps: MemberSessionDeps;

function makeCtx(): AppRuntimeContext {
  const appState = {
    read: async (file: string) => (existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : null),
    update: async (file: string, updater: (current: unknown) => unknown) => {
      const current = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : null;
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(updater(current)), 'utf8');
    },
  };
  return { stateFilePath: path.join(dir, 'state.json'), host: { appState } } as unknown as AppRuntimeContext;
}

/** Every byte the store has written for this test, as one string. */
async function persistedText(): Promise<string> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const contents = await Promise.all(
    files.map((entry) => readFile(path.join(entry.parentPath, entry.name), 'utf8')),
  );
  return contents.join('\n');
}

/** Waits for a condition the runtime reaches asynchronously. Test-only. */
async function waitFor(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('condition never became true');
}

/** Seeds the store and takes the grant, exactly as activation does. */
async function seedRoom(envelope = envelopeWith(), members = MEMBERS): Promise<Room> {
  await store.updateState((state) => ({ ...state, rooms: [roomFixture(envelope, members)] }));
  const seeded = await store.readRoom('room-a');
  if (!seeded) throw new Error('room was not seeded');
  const grant = await requestRoomGrant(host, seeded);
  await store.updateRoom('room-a', (record) => ({
    ...record,
    definition: { ...record.definition, grantId: grant.grantId },
  }));
  const ready = await store.readRoom('room-a');
  if (!ready) throw new Error('room disappeared');
  return ready;
}

function memberOf(room: Room, id: string): RoomMember {
  const member = room.members.find((candidate) => candidate.id === id);
  if (!member) throw new Error(`no member ${id}`);
  return member;
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'room-member-'));
  host = createFakeHost();
  store = createRoomStore(makeCtx());
  deps = { host, store };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('member grant proposal', () => {
  it('gives every member its own subject policy', async () => {
    await seedRoom();
    const [proposal] = host.persistentSessions.proposals;

    expect(Object.keys(proposal.subjects)).toEqual(['lead', 'impl', 'scout']);
    expect(proposal.owner).toBe('room:room-a');
    expect(proposal.workspaceId).toBe('ws-1');
    // Team cap plus the approved replacements: a replacement is a NEW session.
    expect(proposal.maxTotalSessions).toBe(6);
    // maxActiveTurns + the Conductor reserve + headroom, capped by the roster.
    expect(proposal.maxLiveSessions).toBe(4);

    // A worktree member is pinned to its OWN tree, not to the shared workspace.
    expect(proposal.subjects.impl.allowedCwds).toEqual(['/workspaces/ws-1/.sero/worktrees/impl']);
    expect(proposal.subjects.lead.allowedCwds).toEqual(['/workspaces/ws-1']);

    // Cost-bearing choices are pinned to the member's own, never to the pool.
    expect(proposal.subjects.lead.allowedModels).toEqual(['sonnet']);
    expect(proposal.subjects.lead.allowedThinkingLevels).toEqual(['medium']);
    // Every member holds the Room bridge, whether or not the planner listed it.
    expect(proposal.subjects.lead.allowedTools).toContain('sero-cli');
    // One subject can never reach another's tools.
    expect(proposal.subjects.impl.allowedTools).not.toContain('web_fetch');
    expect(proposal.subjects.scout.allowedTools).not.toContain('write');
  });

  it('maps each permission level, and takes network from the member’s own tools', async () => {
    await seedRoom();
    const [proposal] = host.persistentSessions.proposals;

    expect(proposal.subjects.lead.permissionProfile).toEqual({
      filesystem: 'read', commands: 'readOnly', network: 'none', vcs: 'read',
    });
    expect(proposal.subjects.impl.permissionProfile).toEqual({
      filesystem: 'write', commands: 'all', network: 'none', vcs: 'commit',
    });
    // Read-only, but it holds a fetch tool: network is its own reach class.
    expect(proposal.subjects.scout.permissionProfile.network).toBe('fetch');
    expect(proposal.subjects.scout.permissionProfile.filesystem).toBe('read');
  });

  it('refuses to grant a worktree member that has no worktree', async () => {
    const record = roomFixture(envelopeWith(), MEMBERS);
    const implementer = record.members.find((member) => member.id === 'impl');
    if (implementer) implementer.worktreePath = null;
    await store.updateState((state) => ({ ...state, rooms: [record] }));
    const room = await store.readRoom('room-a');
    if (!room) throw new Error('room missing');

    await expect(requestRoomGrant(host, room)).rejects.toThrow(/needs a worktree/);
  });
});

describe('member session lifecycle', () => {
  it('runs three differently configured members on three separate session files', async () => {
    const room = await seedRoom();
    const pool = createMemberSessionPool(deps);
    for (const id of ['lead', 'impl', 'scout']) await pool.ensure(room, memberOf(room, id));

    const stored = await Promise.all(
      ['lead', 'impl', 'scout'].map((id) => store.readMember('room-a', id)),
    );
    const paths = stored.map((member) => member?.session.sessionPath);
    const ids = stored.map((member) => member?.session.sessionId);
    expect(new Set(paths).size).toBe(3);
    expect(new Set(ids).size).toBe(3);
    expect(paths.every((entry) => typeof entry === 'string' && entry.includes('/rooms/'))).toBe(true);

    // Each session carries its own member's configuration, not a Room-wide one.
    const created = host.persistentSessions.requests.filter((request) => request.operation === 'create');
    expect(created.map((request) => request.subject)).toEqual(['lead', 'impl', 'scout']);
    expect(created[1].cwd).toBe('/workspaces/ws-1/.sero/worktrees/impl');
    expect(created[0].cwd).toBe('/workspaces/ws-1');
    expect(created[1].tools).toContain('write');
    expect(created[2].tools).not.toContain('write');
  });


  it('creates a session, names it for Usage, and stores only references', async () => {
    const room = await seedRoom();
    const lead = memberOf(room, 'lead');
    await startMember(deps, room, lead);

    const [request] = host.persistentSessions.requests;
    expect(request.operation).toBe('create');
    expect(request.sessionName).toBe('Room Ship the fix — Conductor');
    expect(memberSessionName(room, lead)).toBe(request.sessionName);
    expect(request.model).toBe('sonnet');
    expect(request.tools).toContain('sero-cli');
    expect(request.systemPromptAdditions?.join('\n')).toContain('Use sero-cli to talk to the Room.');

    const session = host.persistentSessions.sessions.get('lead');
    const stored = await store.readMember('room-a', 'lead');
    expect(stored?.session.sessionId).toBe(session?.sessionId);
    expect(stored?.session.sessionPath).toBe('/sessions/rooms/lead.jsonl');
    expect(stored?.session.liveHandleId).not.toBeNull();
    // `starting` holds a slot; a member with a session is ready.
    expect(stored?.status).toBe('idle');
  });

  it('disposal closes the session and keeps the file, and a reopen uses the same one', async () => {
    const room = await seedRoom();
    const lead = memberOf(room, 'lead');
    await startMember(deps, room, lead);
    const opened = await store.readMember('room-a', 'lead');
    if (!opened) throw new Error('member missing');

    await disposeMember(deps, 'room-a', opened);
    const closed = await store.readMember('room-a', 'lead');
    expect(host.persistentSessions.sessions.get('lead')?.disposed).toBe(true);
    expect(closed?.session.liveHandleId).toBeNull();
    expect(closed?.session.sessionId).toBe(opened.session.sessionId);
    expect(closed?.session.sessionPath).toBe('/sessions/rooms/lead.jsonl');
    // Still schedulable: eviction is not a status change.
    expect(closed?.status).toBe('idle');

    const pool = createMemberSessionPool(deps);
    await pool.ensure(room, lead);
    expect(host.persistentSessions.requests.at(-1)?.operation).toBe('open');
  });
});

describe('member turns', () => {
  it('prepends the brief, then records usage on the member and the Room', async () => {
    const room = await seedRoom();
    const lead = memberOf(room, 'lead');
    const handle = await startMember(deps, room, lead);

    const result = await runMemberTurn(deps, room, lead, handle.handleId, { prompt: 'Plan the work.' });
    expect(result.status).toBe('completed');
    expect(result.turnId).not.toBeNull();

    const sent = String(host.persistentSessions.prompts[0].content);
    expect(sent).toContain('## Room brief');
    expect(sent).toContain('Fix the crash on start');
    expect(sent).toContain('Keep the team moving.');
    expect(sent).toContain('Plan the work.');

    // The member mirrors the session's cumulative totals rather than keeping a
    // count of its own, so the two can never drift.
    const session = host.persistentSessions.sessions.get('lead');
    const stored = await store.readMember('room-a', 'lead');
    expect(stored?.usage.turns).toBe(1);
    expect(stored?.usage.costUsd).toBe(session?.usage.costUsd);
    expect(stored?.usage.costUsd).toBeGreaterThan(0);
    expect(stored?.usage.inputTokens).toBe(session?.usage.inputTokens);
    expect(stored?.status).toBe('idle');

    const record = await store.readRoom('room-a');
    expect(record?.runtime.usage.costUsd).toBe(session?.usage.costUsd);
    expect(record?.runtime.usage.turns).toBe(1);
    expect(record?.runtime.activeMemberIds).toEqual([]);
    // A turn is not structural progress, so the no-progress clock is untouched.
    expect(record?.runtime.lastProgressAt).toBeNull();
  });

  it('counts a failed turn against the bounded budget before giving up on a member', async () => {
    const room = await seedRoom();
    const lead = memberOf(room, 'lead');
    const handle = await startMember(deps, room, lead);
    const api = host.persistentSessions;
    api.failNextPrompt = 'model route is down';

    const first = await runMemberTurn(deps, room, lead, handle.handleId, { prompt: 'Go.' });
    expect(first.status).toBe('error');
    expect(first.detail).toBe('model route is down');
    const afterOne = await store.readMember('room-a', 'lead');
    expect(afterOne?.usage.consecutiveFailures).toBe(1);
    expect(afterOne?.usage.retries).toBe(1);
    // One failure is a retry, not a dead member.
    expect(afterOne?.status).toBe('idle');

    api.failNextPrompt = 'model route is down';
    await runMemberTurn(deps, room, lead, handle.handleId, { prompt: 'Go again.' });
    const afterTwo = await store.readMember('room-a', 'lead');
    expect(afterTwo?.usage.consecutiveFailures).toBe(2);
    expect(afterTwo?.status).toBe('failed');

    // A later good turn clears the run of failures.
    await store.updateMember('room-a', 'lead', (member) => ({ ...member, status: 'idle' }));
    await runMemberTurn(deps, room, lead, handle.handleId, { prompt: 'Try again.' });
    expect((await store.readMember('room-a', 'lead'))?.usage.consecutiveFailures).toBe(0);
  });

  it('waits for a turn that ends later, and records the failure it ends with', async () => {
    const room = await seedRoom();
    const lead = memberOf(room, 'lead');
    const handle = await startMember(deps, room, lead);
    const api = host.persistentSessions;
    api.mode = 'manual';

    const turn = runMemberTurn(deps, room, lead, handle.handleId, { prompt: 'Take your time.' });
    await waitFor(() => api.openTurns().includes('lead'));
    api.endTurn('lead', 'error');

    expect((await turn).status).toBe('error');
    const stored = await store.readMember('room-a', 'lead');
    expect(stored?.usage.consecutiveFailures).toBe(1);
    expect(stored?.status).toBe('idle');
  });

  it('does not resurrect a member that started waiting during its turn', async () => {
    const room = await seedRoom();
    const lead = memberOf(room, 'lead');
    const handle = await startMember(deps, room, lead);

    const api = host.persistentSessions;
    const original = api.prompt.bind(api);
    // Stands in for a question the member asks mid-turn: the message path moves
    // it to `waiting` while the turn is still in flight.
    api.prompt = async (handleId, content) => {
      await store.updateMember('room-a', 'lead', (member) => ({
        ...member,
        status: 'waiting',
        statusDetail: 'Asked the Implementer a question.',
        waitingOnQuestionId: 'q-1',
      }));
      return original(handleId, content);
    };

    await runMemberTurn(deps, room, lead, handle.handleId, { prompt: 'Ask them.' });
    const stored = await store.readMember('room-a', 'lead');
    expect(stored?.status).toBe('waiting');
    expect(stored?.waitingOnQuestionId).toBe('q-1');
    // The wait keeps its own reason. "Finished its turn." here would show the
    // user a waiting member with no sign of what it waits for.
    expect(stored?.statusDetail).toBe('Asked the Implementer a question.');
    // Usage still lands: the turn happened, whatever the member did with it.
    expect(stored?.usage.turns).toBe(1);
  });
});

describe('live session pool', () => {
  it('closes the least recently used member when the Room is at its cap', async () => {
    // maxMembers 2 caps the Room at two live sessions with three members.
    const room = await seedRoom(envelopeWith({ maxMembers: 2, maxActiveTurns: 1 }));
    const pool = createMemberSessionPool(deps);
    const api = host.persistentSessions;

    await pool.ensure(room, memberOf(room, 'lead'));
    await pool.ensure(room, memberOf(room, 'impl'));
    expect(pool.liveCount()).toBe(2);

    await pool.ensure(room, memberOf(room, 'scout'));
    expect(pool.liveCount()).toBe(2);
    // The Conductor was least recently used, so its session closed first.
    expect(api.sessions.get('lead')?.disposed).toBe(true);
    expect(api.sessions.get('impl')?.disposed).toBe(false);
    const evicted = await store.readMember('room-a', 'lead');
    expect(evicted?.session.liveHandleId).toBeNull();
    expect(evicted?.session.sessionId).toBe(api.sessions.get('lead')?.sessionId);

    // Reopening it evicts the next least-recent member rather than creating.
    await pool.ensure(room, memberOf(room, 'lead'));
    expect(api.requests.at(-1)).toMatchObject({ subject: 'lead', operation: 'open' });
    expect(api.sessions.get('impl')?.disposed).toBe(true);
    expect(pool.liveCount()).toBe(2);
  });

  it('never evicts a member that is mid-turn', async () => {
    const room = await seedRoom(envelopeWith({ maxMembers: 2, maxActiveTurns: 1 }));
    const pool = createMemberSessionPool(deps);
    const api = host.persistentSessions;
    api.mode = 'manual';

    await pool.ensure(room, memberOf(room, 'impl'));
    const turn = pool.runTurn(room, memberOf(room, 'lead'), { prompt: 'Hold the line.' });
    await waitFor(() => api.openTurns().includes('lead'));

    // The Conductor is the least recently used, but it is running.
    await pool.ensure(room, memberOf(room, 'scout'));
    expect(api.sessions.get('lead')?.disposed).toBe(false);
    expect(api.sessions.get('impl')?.disposed).toBe(true);

    api.endTurn('lead');
    expect((await turn).status).toBe('completed');
  });

  it('shares one create between two wakes for the same member', async () => {
    const room = await seedRoom();
    const pool = createMemberSessionPool(deps);
    const lead = memberOf(room, 'lead');

    const [first, second] = await Promise.all([pool.ensure(room, lead), pool.ensure(room, lead)]);
    expect(second.handleId).toBe(first.handleId);
    // A second create for a bound subject is a denial, so there must be one.
    expect(host.persistentSessions.requests).toHaveLength(1);
  });

  it('reuses a live session and releases a whole Room on demand', async () => {
    const room = await seedRoom();
    const pool = createMemberSessionPool(deps);
    const api = host.persistentSessions;

    const first = await pool.ensure(room, memberOf(room, 'lead'));
    const second = await pool.ensure(room, memberOf(room, 'lead'));
    expect(second.handleId).toBe(first.handleId);
    expect(api.requests).toHaveLength(1);

    await pool.ensure(room, memberOf(room, 'impl'));
    await pool.releaseRoom('room-a');
    expect(pool.liveCount()).toBe(0);
    expect(api.sessions.get('lead')?.disposed).toBe(true);
    expect(api.sessions.get('impl')?.disposed).toBe(true);
  });
});

describe('live output', () => {
  it('retains a watched turn in memory and writes none of it into Room state', async () => {
    const room = await seedRoom();
    const observation = createRoomObservation({ sessions: host.persistentSessions, now: () => host.now() });
    const pool = createMemberSessionPool({ ...deps, observation });
    const stopWatching = observation.watchMember('lead', () => undefined);

    await pool.runTurn(room, memberOf(room, 'lead'), { prompt: 'Plan the work.' });

    // The model's streamed reply is readable live...
    const snapshot = observation.snapshotMember('lead');
    expect(snapshot?.text).toContain('reply turn-1');
    expect(snapshot?.lastTurnStatus).toBe('completed');

    // ...and appears in no persisted Room file. A transcript belongs to the Pi
    // session; copying it into Room state would make a second one (NFR-002).
    expect(await persistedText()).not.toContain('reply turn-1');

    // Losing the last watcher drops the retained text at once.
    stopWatching();
    expect(observation.snapshotMember('lead')?.text).toBe('');

    // A disposed member leaves no stale live line behind.
    await pool.release('room-a', 'lead');
    expect(observation.snapshotMember('lead')).toBeNull();
  });
});

describe('restart recovery', () => {
  it('drops stale handles and frees the slots a dead process left held', async () => {
    const room = await seedRoom();
    const pool = createMemberSessionPool(deps);
    await pool.ensure(room, memberOf(room, 'lead'));
    await store.updateRoom('room-a', (record) => ({
      ...record,
      members: record.members.map((member) =>
        member.id === 'lead' ? { ...member, status: 'working', statusDetail: 'Working.' } : member,
      ),
      runtime: { ...record.runtime, activeMemberIds: ['lead'] },
    }));

    // A restart: nothing is live, and the persisted handle is a stale pointer.
    const reconciled = await reconcileMemberSessions({ host, store }, 'room-a');
    expect(reconciled).toEqual(['lead']);

    const stored = await store.readMember('room-a', 'lead');
    expect(stored?.status).toBe('idle');
    expect(stored?.session.liveHandleId).toBeNull();
    expect(stored?.session.sessionId).toBe(host.persistentSessions.sessions.get('lead')?.sessionId);
    const record = await store.readRoom('room-a');
    expect(record?.runtime.activeMemberIds).toEqual([]);

    expect(await reconcileMemberSessions({ host, store }, 'room-a')).toEqual([]);
  });
});
