/**
 * Follows every member file of one Room.
 *
 * Each member has its own file, so a member changing status rewrites one small
 * file rather than the whole Room — but the panel needs all of them at once
 * (names in the timeline, panes in the Watch view, the roster rail), so they are
 * watched together here and read from one map. React's hook rules make a
 * per-member hook impossible for a roster that changes size, which is the other
 * reason this talks to the bridge directly.
 */

import { useEffect, useState } from 'react';
import { getSeroApi } from '@sero-ai/app-runtime';
import type { RoomMember } from '../../shared/room-types';
import { useStateDir } from './use-orchestrator-index';

export function useRoomMembers(roomId: string | null, memberIds: string[]): Map<string, RoomMember> {
  const [members, setMembers] = useState<Map<string, RoomMember>>(new Map());
  const stateDir = useStateDir();
  // The roster identity, so re-rendering with an equal list does not resubscribe.
  const roster = memberIds.join(',');

  // The cleanup below does unsubscribe and unwatch every path, but it builds
  // those calls in a loop over `byPath`, which the rule cannot follow back to
  // the loop that made them. See `use-watched-json.ts` for the same effect with
  // one path, which the rule reads correctly.
  // react-doctor-disable-next-line react-doctor/effect-needs-cleanup
  useEffect(() => {
    if (!roomId || !stateDir || !roster) {
      setMembers(new Map());
      return;
    }
    const api = getSeroApi().appState;
    const byPath = new Map(
      roster.split(',').map((memberId) => [`${stateDir}/rooms/${roomId}/members/${memberId}.json`, memberId]),
    );
    let active = true;
    const remember = (memberId: string, member: RoomMember) =>
      setMembers((current) => new Map(current).set(memberId, member));

    const unsubscribe = api.onChange<RoomMember | null>((changedPath, value) => {
      const memberId = byPath.get(changedPath);
      if (!active || !memberId || !value) return;
      remember(memberId, value);
    });
    for (const [path, memberId] of byPath) {
      void api.watch<RoomMember | null>(path).then(({ data: current }) => {
        if (active && current) remember(memberId, current);
      });
    }

    return () => {
      active = false;
      unsubscribe();
      for (const path of byPath.keys()) void api.unwatch(path);
    };
  }, [roomId, stateDir, roster]);

  return members;
}

/** Display names by member id, for the surfaces that show who did something. */
export function memberNames(members: Map<string, RoomMember>): Map<string, string> {
  return new Map([...members].map(([id, member]) => [id, member.displayName]));
}
