/** Cleanup for lifecycle work interrupted by a process restart. */

import { TERMINAL_ROOM_STATUSES } from '../../shared/room-types';
import { withMemberStatus, withRoomStatus } from './room-actions';
import { releaseAuthority, type RoomLifecycleContext } from './room-lifecycle';
import type { RoomState } from './room-state';

export async function finishInterruptedCleanup(ctx: RoomLifecycleContext, state: RoomState): Promise<void> {
  const interrupted = state.rooms.filter(
    (room) => room.runtime.status === 'starting' || room.runtime.status === 'adjusting',
  );
  for (const room of interrupted) {
    const roomId = room.definition.id;
    ctx.host.log(`room ${roomId}: resetting an interrupted ${room.runtime.status}.`);
    if (room.definition.grantId) {
      await ctx.workspaces.preserveRoom(roomId, 'Start was interrupted.').catch(() => []);
      await releaseAuthority(ctx, roomId, 'Interrupted Start cleaned up.');
    }
    await ctx.workspaces.releaseRoom(roomId, 'Start was interrupted.');
    await ctx.store.transact(roomId, null, (current) => {
      const status = current.runtime.status;
      return {
        record: status === 'starting' || status === 'adjusting'
          ? withRoomStatus({
              ...current,
              members: current.members.map((member) =>
                withMemberStatus(member, 'offline', 'Waiting for the Room to start.')),
            }, 'draft', ctx.host.now(), null)
          : null,
        result: null,
      };
    });
  }

  const stranded = state.rooms.filter(
    (room) => TERMINAL_ROOM_STATUSES.includes(room.runtime.status) && room.definition.grantId,
  );
  for (const room of stranded) {
    const roomId = room.definition.id;
    const detail = room.runtime.stopReason?.detail ?? 'The Room finished.';
    ctx.host.log(`room ${roomId}: finishing cleanup a restart interrupted.`);
    await ctx.workspaces.preserveRoom(roomId, detail).catch((error: unknown) => {
      ctx.host.log(`room ${roomId}: could not preserve member work during recovery: ${String(error)}`);
      return [];
    });
    await releaseAuthority(ctx, roomId, detail);
  }
}
