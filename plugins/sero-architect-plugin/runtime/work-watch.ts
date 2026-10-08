/**
 * Watch work: what a project's owner and its linked Rooms are writing now.
 *
 * Nothing here runs until a view asks. Each open view holds a lease, and the
 * text is forwarded only while one lease is current. A view that closes or
 * stops renewing ends its lease, and with the last lease gone the runtime
 * holds no text and sends none.
 */

import { getOrchestratorRoomRegistry, type OrchestratorRoomMemberLive, type PersistentSessionLiveSnapshot, type PersistentSessionsApi } from '@sero-ai/common';

import type { OwnerLiveNotice } from '../shared/feedback';
import type { ProjectRecord } from '../shared/record';

/** A view renews well inside this. A view that went away stops being served. */
export const WATCH_LEASE_MS = 5 * 60_000;
const PUSH_INTERVAL_MS = 200;
const RECENT_LIMIT = 3;

type LiveTool = NonNullable<PersistentSessionLiveSnapshot['tool']>;

export interface WorkWatchDeps {
  sessions(): PersistentSessionsApi | null;
  /** The open owner session of a project, if one is open now. */
  ownerHandle(projectId: string): string | undefined;
  read(projectId: string): Promise<ProjectRecord | null>;
  emit(notice: OwnerLiveNotice): void;
  now(): number;
}

export interface WorkWatch {
  watchOwner(projectId: string, observerId: string): OwnerLiveNotice;
  unwatchOwner(projectId: string, observerId: string): void;
  /** Null when the Room is not this project's, or its runtime is not running. */
  watchRoom(projectId: string, roomId: string, observerId: string): Promise<OrchestratorRoomMemberLive[] | null>;
  unwatchRoom(projectId: string, roomId: string, observerId: string): Promise<void>;
  /** The owner session of a project opened or closed. */
  ownerChanged(projectId: string): void;
  dispose(): void;
}

/** Every Room the record says this project started. Read from the record, never from a title. */
export function linkedRoomIds(record: ProjectRecord): Set<string> {
  return new Set([
    ...record.milestones.flatMap((milestone) => milestone.dispatch?.kind === 'room' ? [milestone.dispatch.id] : []),
    ...(record.pendingResearch ?? []).flatMap((entry) => entry.roomId ?? []),
    ...record.research.flatMap((entry) => entry.roomId ?? []),
  ]);
}

interface OwnerLease {
  observers: Map<string, number>;
  handleId: string | null;
  off: (() => void) | null;
  timer: ReturnType<typeof setTimeout> | null;
  /** The tool and turn the last session event showed, to see when a tool finishes. */
  lastTool: LiveTool | null;
  lastTurnId: string | null;
  /** Finished tool calls of the current turn, newest first. */
  recent: { toolName: string; summary: string }[];
}

const sameCall = (a: LiveTool, b: LiveTool) => a.callId !== null || b.callId !== null ? a.callId === b.callId : a.startedAt === b.startedAt;

export function createWorkWatch(deps: WorkWatchDeps): WorkWatch {
  const owners = new Map<string, OwnerLease>();

  const snapshot = (projectId: string): OwnerLiveNotice => {
    const handleId = deps.ownerHandle(projectId);
    return {
      projectId,
      live: handleId ? deps.sessions()?.liveSnapshot(handleId) ?? null : null,
      recent: owners.get(projectId)?.recent ?? [],
    };
  };

  const release = (projectId: string) => {
    const lease = owners.get(projectId);
    if (!lease) return;
    lease.off?.();
    if (lease.timer) clearTimeout(lease.timer);
    owners.delete(projectId);
  };

  /** Drops observers whose lease ran out. Returns whether anyone still watches. */
  const current = (projectId: string): OwnerLease | null => {
    const lease = owners.get(projectId);
    if (!lease) return null;
    const now = deps.now();
    for (const [observerId, expiresAt] of lease.observers) if (expiresAt <= now) lease.observers.delete(observerId);
    if (lease.observers.size > 0) return lease;
    release(projectId);
    return null;
  };

  const push = (projectId: string) => {
    const lease = current(projectId);
    if (!lease || lease.timer) return;
    // One push per interval, sent at its end, so the last change always arrives.
    lease.timer = setTimeout(() => {
      lease.timer = null;
      if (current(projectId)) deps.emit(snapshot(projectId));
    }, PUSH_INTERVAL_MS);
  };

  /** Runs on every session event, before the throttle, so a short tool call is still counted. */
  const track = (lease: OwnerLease, live: PersistentSessionLiveSnapshot | null) => {
    const turnId = live?.turnId ?? null;
    if (turnId !== null && turnId !== lease.lastTurnId) {
      lease.recent = [];
      lease.lastTool = null;
    }
    const tool = live?.tool ?? null;
    if (lease.lastTool && !(tool && sameCall(lease.lastTool, tool))) {
      const { toolName, summary } = lease.lastTool;
      lease.recent = [{ toolName, summary }, ...lease.recent].slice(0, RECENT_LIMIT);
    }
    lease.lastTool = tool;
    if (turnId !== null) lease.lastTurnId = turnId;
  };

  const bind = (projectId: string, lease: OwnerLease) => {
    const handleId = deps.ownerHandle(projectId) ?? null;
    if (handleId === lease.handleId) return;
    lease.off?.();
    lease.handleId = handleId;
    const api = deps.sessions();
    lease.lastTool = null;
    lease.lastTurnId = null;
    lease.recent = [];
    // The tool in flight when the watch opens is noted, so its end is counted.
    if (handleId && api) track(lease, api.liveSnapshot(handleId));
    lease.off = handleId && api ? api.subscribe(handleId, () => {
      track(lease, api.liveSnapshot(handleId));
      push(projectId);
    }) : null;
  };

  const room = async (projectId: string, roomId: string) => {
    const record = await deps.read(projectId);
    if (!record?.workspaceId || !linkedRoomIds(record).has(roomId)) return null;
    return getOrchestratorRoomRegistry()?.get(record.workspaceId)?.handle ?? null;
  };

  return {
    watchOwner(projectId, observerId) {
      const lease = current(projectId) ?? { observers: new Map<string, number>(), handleId: null, off: null, timer: null, lastTool: null, lastTurnId: null, recent: [] };
      lease.observers.set(observerId, deps.now() + WATCH_LEASE_MS);
      owners.set(projectId, lease);
      bind(projectId, lease);
      return snapshot(projectId);
    },

    unwatchOwner(projectId, observerId) {
      const lease = owners.get(projectId);
      if (!lease) return;
      lease.observers.delete(observerId);
      if (lease.observers.size === 0) release(projectId);
    },

    async watchRoom(projectId, roomId, observerId) {
      const handle = await room(projectId, roomId);
      if (!handle?.watch) return null;
      // The Orchestrator keeps its own lease per observer; the project id keeps
      // two projects' views apart.
      return handle.watch(roomId, `architect:${projectId}:${observerId}`);
    },

    async unwatchRoom(projectId, roomId, observerId) {
      const handle = await room(projectId, roomId);
      await handle?.unwatch?.(roomId, `architect:${projectId}:${observerId}`);
    },

    ownerChanged(projectId) {
      const lease = current(projectId);
      if (!lease) return;
      bind(projectId, lease);
      deps.emit(snapshot(projectId));
    },

    dispose() {
      for (const projectId of [...owners.keys()]) release(projectId);
    },
  };
}
