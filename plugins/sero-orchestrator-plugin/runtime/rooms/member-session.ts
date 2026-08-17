/**
 * Member session lifecycle (spec §14, architecture §3, §6).
 *
 * Every member runs on a standard persistent Pi session, reached ONLY through
 * the host's `appRuntime.persistentSessions` capability. Room code never
 * constructs a Pi session and never touches SessionManager: the host owns the
 * grant, the paths and the resource profile, and it hands back a handle.
 *
 * Three rules hold this file together:
 *
 *  - **Disposal never loses work.** Closing a live session closes the
 *    `AgentSession`. The file, the session id and the host's subject binding all
 *    survive, so a later wake opens the same transcript (§14.3).
 *  - **A waiting member holds no slot.** Nothing here keeps a session busy
 *    between turns, and the pool is free to close an idle member's session under
 *    pressure and reopen it on demand.
 *  - **The store is the single writer of Room state.** Session references,
 *    status and usage move through it, never through a field on this module.
 */

import type { PersistentSessionHandle } from '@sero-ai/common';
import type { WorkItem } from '../../shared/room-message-types';
import type { MemberUsage, Room, RoomMember } from '../../shared/room-types';
import type { OrchestratorHost } from '../host';
import {
  memberSessionRequest,
  requirePersistentSessions,
  roomLiveSessionCap,
} from './member-grant';
import { projectBriefForMember, renderMemberBrief } from './room-brief';
import type { RoomObservation } from './room-observation';
import {
  markMemberWorking,
  readSessionUsage,
  recordMemberTurn,
  watchTurn,
  type MemberTurnStatus,
  type TurnOutcome,
} from './member-turn';
import type { RoomStore } from './room-store';

// Re-exported so activation and the coordinator import the whole member surface
// from one module.
export { memberSessionName, requestRoomGrant, toMemberRecord } from './member-grant';

/** Runtime-wide ceiling on open sessions, across every Room in the workspace. */
const DEFAULT_MAX_LIVE_SESSIONS = 12;

export interface MemberSessionDeps {
  host: OrchestratorHost;
  store: RoomStore;
  /**
   * The live-output buffer (room-observation.ts). It follows the SESSION, so it
   * is attached where the handle is recorded and dropped where the handle is
   * closed — a member nobody watches keeps no streamed text, and a disposed one
   * leaves no stale live line behind (NFR-016).
   */
  observation?: Pick<RoomObservation, 'attach' | 'detach'>;
}

export interface MemberTurnRequest {
  /** What this member is being asked to do now. */
  prompt: string;
  /** Current work items, for the member's own brief projection. */
  work?: WorkItem[];
  signal?: AbortSignal;
  /**
   * Called once the session has taken the prompt onto its own transcript.
   * Whatever the prompt carried is delivered at that point and not before, so
   * this is the only safe place to commit against it.
   */
  onAccepted?(turnId: string): Promise<void>;
}

export interface MemberTurnResult {
  turnId: string | null;
  status: MemberTurnStatus;
  detail: string;
  /** Member totals after the turn. Null when the write could not be read back. */
  usage: MemberUsage | null;
}

/** Opens a member's first session. The host names the file inside the grant's dir. */
export async function startMember(
  deps: MemberSessionDeps,
  room: Room,
  member: RoomMember,
): Promise<PersistentSessionHandle> {
  const api = requirePersistentSessions(deps.host);
  const handle = await api.create(memberSessionRequest(deps.host, room, member, 'create'));
  await recordOpened(deps, room, member, handle, 'created');
  return handle;
}

/**
 * Reopens the session a member already has. The request carries no path — the
 * host resolves it from its own immutable subject registry, which is what makes
 * a pathless open safe.
 */
export async function reopenMember(
  deps: MemberSessionDeps,
  room: Room,
  member: RoomMember,
): Promise<PersistentSessionHandle> {
  const api = requirePersistentSessions(deps.host);
  const handle = await api.open(memberSessionRequest(deps.host, room, member, 'open'));
  await recordOpened(deps, room, member, handle, 'reopened');
  return handle;
}

/**
 * Closes a member's live session.
 *
 * The member's STATUS is deliberately untouched: an evicted member is still
 * idle and still schedulable, and its next turn reopens the same file. Only the
 * live handle is cleared.
 */
export async function disposeMember(
  deps: MemberSessionDeps,
  roomId: string,
  member: RoomMember,
): Promise<void> {
  const handleId = member.session.liveHandleId;
  if (!handleId) return;
  deps.observation?.detach(member.id);
  await requirePersistentSessions(deps.host).dispose(handleId);
  const now = deps.host.now();
  await deps.store.updateMember(roomId, member.id, (current) => ({
    ...current,
    session: { ...current.session, liveHandleId: null, lastClosedAt: now },
  }));
  await appendSessionEvent(deps, roomId, member, 'closed', { sessionId: member.session.sessionId ?? '' });
}

/**
 * Runs one turn on an open session.
 *
 * The member's brief projection is prepended to the TURN, not to the system
 * prompt: the brief changes between turns, and moving it would break the cached
 * system-prompt prefix and force a session rebuild on every mandate change.
 */
export async function runMemberTurn(
  deps: MemberSessionDeps,
  room: Room,
  member: RoomMember,
  handleId: string,
  request: MemberTurnRequest,
): Promise<MemberTurnResult> {
  const api = requirePersistentSessions(deps.host);
  const roomId = room.definition.id;
  const brief = renderMemberBrief(projectBriefForMember(room.brief, member, request.work ?? []));
  const content = `${brief}\n\n## Your turn\n${request.prompt}`;

  await markMemberWorking(deps.store, roomId, member.id);
  // Subscribed before the prompt, so a turn that ends immediately is still seen.
  const watch = watchTurn(api, handleId);

  let outcome: TurnOutcome;
  try {
    const { turnId } = await api.prompt(handleId, content);
    await request.onAccepted?.(turnId);
    outcome = await watch.settle(turnId, request.signal);
  } catch (error) {
    // A denied, revoked or failed turn is a real outcome, not a crash: it spends
    // the member's bounded failure budget and the Room carries on (spec §30).
    outcome = { turnId: null, status: 'error', detail: describeError(error) };
  } finally {
    watch.stop();
  }

  const usage = await recordMemberTurn(
    deps.host,
    deps.store,
    roomId,
    member.id,
    outcome,
    await readSessionUsage(api, handleId),
  );
  return { turnId: outcome.turnId, status: outcome.status, detail: outcome.detail, usage };
}

/**
 * Restart recovery for member sessions (the pattern in runtime/reconcile.ts,
 * applied to Rooms).
 *
 * Nothing is live after a restart — the host rebuilds its live registry from
 * zero — so a persisted handle id is a stale pointer and a member left `working`
 * is a slot that would never be released. Those two are reset before anything is
 * scheduled. Session ids and paths are kept: the transcript is still there.
 *
 * A member left `starting` with no session is NOT touched: that is the state
 * activation gives a member it has not opened yet, not the wreckage of a turn.
 *
 * Returns the members it reset, so the coordinator can decide who to wake.
 */
export async function reconcileMemberSessions(deps: MemberSessionDeps, roomId: string): Promise<string[]> {
  const record = await deps.store.readRoom(roomId);
  if (!record) return [];
  const stale = record.members.filter(
    (member) => member.session.liveHandleId !== null || member.status === 'working',
  );
  if (stale.length === 0) return [];

  const now = deps.host.now();
  const staleIds = new Set(stale.map((member) => member.id));
  await deps.store.updateRoom(roomId, (current) => ({
    ...current,
    members: current.members.map((member) =>
      staleIds.has(member.id)
        ? {
            ...member,
            status: member.status === 'working' ? 'idle' : member.status,
            statusDetail: 'Ready again after a restart.',
            session: { ...member.session, liveHandleId: null, lastClosedAt: now },
          }
        : member,
    ),
    runtime: {
      ...current.runtime,
      activeMemberIds: current.runtime.activeMemberIds.filter((id) => !staleIds.has(id)),
    },
  }));
  await deps.store.appendTimeline(roomId, [
    {
      id: deps.host.newId('evt'),
      roomId,
      at: now,
      kind: 'recovery',
      memberId: null,
      summary: `Restart: ${stale.length} member session(s) reset. History is unchanged.`,
      details: { members: stale.map((member) => member.id).join(',') },
    },
  ]);
  return [...staleIds];
}

interface LiveEntry {
  roomId: string;
  memberId: string;
  handle: PersistentSessionHandle;
  /** Injectable clock, so LRU order is deterministic in tests. */
  lastUsedMs: number;
  /** A member mid-turn is never evicted — closing it would lose the turn. */
  busy: boolean;
}

export interface MemberSessionPool {
  /** Opens or reuses this member's session, closing the least-recent one if needed. */
  ensure(room: Room, member: RoomMember): Promise<PersistentSessionHandle>;
  runTurn(room: Room, member: RoomMember, request: MemberTurnRequest): Promise<MemberTurnResult>;
  /** Closes one member's session. The file and its history stay. */
  release(roomId: string, memberId: string): Promise<void>;
  /** Closes a whole Room's sessions — pause, completion or deletion. */
  releaseRoom(roomId: string): Promise<void>;
  /** Closes everything. Called on application exit. */
  releaseAll(): Promise<void>;
  liveCount(): number;
}

export interface MemberSessionPoolOptions {
  /**
   * Runtime-wide cap on open sessions. The host separately enforces each
   * grant's own live cap; this one exists for local resource pressure.
   */
  maxLiveSessions?: number;
}

/**
 * A bounded pool of open sessions.
 *
 * Two caps apply before a session opens: the Room's own (derived from the same
 * envelope the grant proposal used, so the pool closes a session rather than
 * eating a host denial) and the runtime-wide one. Eviction always takes the
 * least recently used IDLE session, and never a member that is mid-turn.
 */
export function createMemberSessionPool(
  deps: MemberSessionDeps,
  options: MemberSessionPoolOptions = {},
): MemberSessionPool {
  const maxLiveSessions = options.maxLiveSessions ?? DEFAULT_MAX_LIVE_SESSIONS;
  const entries = new Map<string, LiveEntry>();
  /** Opens in flight, so two wakes for one member share one create. */
  const opening = new Map<string, Promise<LiveEntry>>();
  const key = (roomId: string, memberId: string): string => `${roomId}/${memberId}`;
  const nowMs = (): number => Date.parse(deps.host.now());

  async function closeEntry(entry: LiveEntry): Promise<void> {
    entries.delete(key(entry.roomId, entry.memberId));
    const member = await deps.store.readMember(entry.roomId, entry.memberId);
    // A member record can be gone (Room deleted mid-flight); the handle still
    // has to be closed, so the host's live count is released either way.
    if (member) await disposeMember(deps, entry.roomId, member);
    else {
      deps.observation?.detach(entry.memberId);
      await requirePersistentSessions(deps.host).dispose(entry.handle.handleId);
    }
  }

  /** Closes the least recently used idle session, optionally within one Room. */
  async function evictOne(roomId: string | null): Promise<boolean> {
    const candidates = [...entries.values()]
      .filter((entry) => !entry.busy && (roomId === null || entry.roomId === roomId))
      .sort((left, right) => left.lastUsedMs - right.lastUsedMs);
    const victim = candidates[0];
    if (!victim) return false;
    await closeEntry(victim);
    return true;
  }

  async function makeSpace(room: Room): Promise<void> {
    const roomId = room.definition.id;
    const roomCap = roomLiveSessionCap(room.definition.envelope);
    const countFor = (): number => [...entries.values()].filter((entry) => entry.roomId === roomId).length;
    while (countFor() >= roomCap) {
      if (!(await evictOne(roomId))) {
        // Every session in this Room is mid-turn, which means the pool cap sits
        // below the scheduler's concurrency. That is a configuration defect, and
        // silently overshooting it would let the host deny the open instead.
        throw new Error(`room ${roomId} has ${roomCap} sessions open and all of them are busy`);
      }
    }
    while (entries.size >= maxLiveSessions) {
      if (!(await evictOne(null))) {
        throw new Error(`the live session pool is full (${maxLiveSessions}) and every session is busy`);
      }
    }
  }

  async function openEntry(room: Room, member: RoomMember, entryKey: string): Promise<LiveEntry> {
    const roomId = room.definition.id;
    await makeSpace(room);
    // Read the CURRENT record: the caller may hold a clone taken before the
    // member's first session was recorded, and creating twice for one subject is
    // a denial (the host binds a subject to its file exactly once).
    const current = (await deps.store.readMember(roomId, member.id)) ?? member;
    const handle = current.session.sessionId
      ? await reopenMember(deps, room, current)
      : await startMember(deps, room, current);
    const entry: LiveEntry = { roomId, memberId: member.id, handle, lastUsedMs: nowMs(), busy: false };
    entries.set(entryKey, entry);
    return entry;
  }

  async function ensureEntry(room: Room, member: RoomMember): Promise<LiveEntry> {
    const entryKey = key(room.definition.id, member.id);
    const existing = entries.get(entryKey);
    if (existing) {
      existing.lastUsedMs = nowMs();
      return existing;
    }
    // Two wakes for one member must share one open. Without this, both would
    // miss the map and the second would be denied as a duplicate create.
    const inFlight = opening.get(entryKey);
    if (inFlight) return inFlight;
    const task = openEntry(room, member, entryKey);
    opening.set(entryKey, task);
    try {
      return await task;
    } finally {
      opening.delete(entryKey);
    }
  }

  return {
    ensure: async (room, member) => (await ensureEntry(room, member)).handle,

    async runTurn(room, member, request) {
      const entry = await ensureEntry(room, member);
      entry.busy = true;
      try {
        return await runMemberTurn(deps, room, member, entry.handle.handleId, request);
      } finally {
        entry.busy = false;
        entry.lastUsedMs = nowMs();
      }
    },

    async release(roomId, memberId) {
      const entry = entries.get(key(roomId, memberId));
      if (entry) await closeEntry(entry);
    },

    async releaseRoom(roomId) {
      for (const entry of [...entries.values()]) {
        if (entry.roomId === roomId) await closeEntry(entry);
      }
    },

    async releaseAll() {
      for (const entry of [...entries.values()]) await closeEntry(entry);
    },

    liveCount: () => entries.size,
  };
}

async function recordOpened(
  deps: MemberSessionDeps,
  room: Room,
  member: RoomMember,
  handle: PersistentSessionHandle,
  action: 'created' | 'reopened',
): Promise<void> {
  const now = deps.host.now();
  // Attached to the NEW handle: a reopened member runs on a different session
  // object, and the previous subscription would report one it no longer uses.
  deps.observation?.attach(room.definition.id, member.id, handle.handleId);
  await deps.store.updateMember(room.definition.id, member.id, (current) => ({
    ...current,
    // `starting` holds an execution slot. A member that now has a session is
    // ready, so leaving it starting would count it as running for ever.
    status: current.status === 'starting' ? 'idle' : current.status,
    statusDetail: current.status === 'starting' ? 'Ready.' : current.statusDetail,
    session: {
      ...current.session,
      sessionId: handle.sessionId,
      sessionPath: handle.sessionPath,
      liveHandleId: handle.handleId,
      lastOpenedAt: now,
    },
  }));
  await appendSessionEvent(deps, room.definition.id, member, action, { sessionId: handle.sessionId });
}

function appendSessionEvent(
  deps: MemberSessionDeps,
  roomId: string,
  member: RoomMember,
  action: string,
  details: Record<string, string>,
): Promise<void> {
  return deps.store.appendTimeline(roomId, [
    {
      id: deps.host.newId('evt'),
      roomId,
      at: deps.host.now(),
      kind: 'session',
      memberId: member.id,
      summary: `${member.displayName} session ${action}.`,
      details,
    },
  ]);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
