/**
 * The live text a Work view shows while one of its rows is open.
 *
 * A row asks only when the user opens it. The view subscribes first and reads
 * second, so nothing falls between the two, and it keeps the higher revision,
 * so a reply that lands late cannot roll the text back. Closing the row, or
 * leaving the view, ends the watch.
 */

import { useEffect, useState } from 'react';
import { getSeroApi, useAppRuntimeEvents, useAppTools } from '@sero-ai/app-runtime';
import { ORCHESTRATOR_APP_ID, ORCHESTRATOR_ROOM_LIVE_TOPIC, type OrchestratorRoomMemberLive, type PersistentSessionLiveSnapshot } from '@sero-ai/common';

import { ARCHITECT_OWNER_LIVE_TOPIC, type OwnerLiveNotice } from '../../shared/feedback';
import { PROJECTS_TOOL } from './actions';

/** Well inside the runtime's lease, so an open view never lapses. */
const RENEW_MS = 2 * 60_000;

const newObserverId = () => `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export interface OwnerWatch {
  /** The owner's current turn. Null when no owner session is open. */
  live: PersistentSessionLiveSnapshot | null;
  /** The last few tool calls of this turn that finished, newest first. */
  recent: OwnerLiveNotice['recent'];
  /** How many tool calls of this turn have finished. */
  finished: number;
}

/** The owner's current turn and its last few finished actions, while `active`. */
export function useOwnerWatch(projectId: string, active: boolean): OwnerWatch {
  const { run } = useAppTools();
  const [observerId] = useState(newObserverId);
  const [held, setHeld] = useState<OwnerLiveNotice | null>(null);
  const keep = (notice: OwnerLiveNotice) => setHeld((current) => {
    if (!current || current.projectId !== notice.projectId || !current.live || !notice.live) return notice;
    // A new turn starts its count again, so a different turn always wins.
    return current.live.turnId === notice.live.turnId && current.live.revision > notice.live.revision ? current : notice;
  });

  useAppRuntimeEvents<OwnerLiveNotice>(ARCHITECT_OWNER_LIVE_TOPIC, (notice) => {
    if (active && notice?.projectId === projectId) keep(notice);
  });

  useEffect(() => {
    if (!active) return;
    let current = true;
    const read = () => {
      void run(PROJECTS_TOOL, { action: 'watch_owner', projectId, observerId }).then((result) => {
        const notice = (result.details as { ownerLive?: OwnerLiveNotice } | undefined)?.ownerLive;
        if (current && notice) keep(notice);
      }).catch(() => undefined);
    };
    read();
    const renew = setInterval(read, RENEW_MS);
    return () => {
      current = false;
      clearInterval(renew);
      void run(PROJECTS_TOOL, { action: 'unwatch_owner', projectId, observerId }).catch(() => undefined);
    };
  }, [active, projectId, observerId, run]);

  return active && held?.projectId === projectId ? { live: held.live, recent: held.recent ?? [], finished: held.finished ?? 0 } : { live: null, recent: [], finished: 0 };
}

/** One member of a Room this project started, while `active`. */
export function useLinkedMemberLive(projectId: string, workspaceId: string | null, roomId: string, memberId: string, active: boolean): OrchestratorRoomMemberLive | null {
  const { run } = useAppTools();
  const [observerId] = useState(newObserverId);
  const [held, setHeld] = useState<OrchestratorRoomMemberLive | null>(null);

  // The listener is added once per watched member. `run` is stable, and the
  // other dependencies name the member, so a change of any is a new subscription.
  // react-doctor-disable-next-line react-doctor/advanced-event-handler-refs
  useEffect(() => {
    if (!active || !workspaceId) return;
    let current = true;
    const keep = (next: OrchestratorRoomMemberLive | undefined) => {
      if (!current || !next || next.roomId !== roomId || next.memberId !== memberId) return;
      setHeld((was) => was && was.revision > next.revision ? was : next);
    };
    let bridge: ReturnType<typeof getSeroApi>['appRuntime'];
    try {
      bridge = getSeroApi().appRuntime;
    } catch {
      return;
    }
    if (!bridge) return;
    // The Room's runtime pushes on its own app and workspace, not on ours.
    const off = bridge.onEvent((event) => {
      if (event.appId !== ORCHESTRATOR_APP_ID || event.workspaceId !== workspaceId || event.topic !== ORCHESTRATOR_ROOM_LIVE_TOPIC) return;
      keep((event.payload as { snapshot?: OrchestratorRoomMemberLive } | null)?.snapshot);
    });
    void bridge.subscribe(ORCHESTRATOR_APP_ID, workspaceId, ORCHESTRATOR_ROOM_LIVE_TOPIC);
    const read = () => {
      void run(PROJECTS_TOOL, { action: 'watch_room', projectId, roomId, observerId }).then((result) => {
        const members = (result.details as { members?: OrchestratorRoomMemberLive[] } | undefined)?.members ?? [];
        keep(members.find((member) => member.memberId === memberId));
      }).catch(() => undefined);
    };
    read();
    const renew = setInterval(read, RENEW_MS);
    return () => {
      current = false;
      clearInterval(renew);
      off();
      void bridge.unsubscribe(ORCHESTRATOR_APP_ID, workspaceId, ORCHESTRATOR_ROOM_LIVE_TOPIC);
      void run(PROJECTS_TOOL, { action: 'unwatch_room', projectId, roomId, observerId }).catch(() => undefined);
    };
  }, [active, projectId, workspaceId, roomId, memberId, observerId, run]);

  return active && held?.roomId === roomId && held.memberId === memberId ? held : null;
}
