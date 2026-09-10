import type { DeliveryReceipt } from '../../shared/delivery-types';
import { TERMINAL_ROOM_STATUSES } from '../../shared/room-types';
import { requirePersistentSessions } from './member-grant';
import { timelineEvent, withMemberStatus, withRoomStatus } from './room-actions';
import { deliverRoomResult } from './room-delivery';
import type { RoomActionResult, RoomLifecycleContext } from './room-lifecycle';
import type { RoomStore } from './room-store';

const finishing = new WeakMap<RoomStore, Map<string, Promise<void>>>();

/** Return from the member's finish tool before closing the session that runs it. */
export async function completeRoom(
  ctx: RoomLifecycleContext,
  roomId: string,
  summary = 'The Room finished its work.',
  receipt?: DeliveryReceipt,
): Promise<RoomActionResult> {
  if (!(await ctx.store.readRoom(roomId))) return { ok: false, error: `Room not found: ${roomId}` };
  const claimed = await ctx.store.transact(roomId, null, (current) => {
    if (TERMINAL_ROOM_STATUSES.includes(current.runtime.status) || current.runtime.status === 'completing') {
      return { record: null, result: false };
    }
    return {
      record: withRoomStatus({
        ...current,
        runtime: { ...current.runtime, completion: { summary, receipt } },
        members: current.members.map((member) => withMemberStatus(member, 'completed', summary)),
      }, 'completing', ctx.host.now(), null),
      result: true,
    };
  });
  if (claimed.duplicate || !claimed.result) return { ok: false, error: 'This Room is already finishing or finished.' };
  await settleRoomCompletion(ctx, roomId);
  return { ok: true, room: (await ctx.store.readRoom(roomId)) ?? undefined };
}

/** Final usage must be saved before delivery reads the totals and authority closes. */
export async function settleRoomCompletion(ctx: RoomLifecycleContext, roomId: string): Promise<void> {
  if (ctx.hasTurnsInFlight(roomId)) return;
  const record = await ctx.store.readRoom(roomId);
  const completion = record?.runtime.completion;
  if (!record || record.runtime.status !== 'completing' || !completion || record.runtime.stopReason) return;
  let operations = finishing.get(ctx.store);
  if (!operations) { operations = new Map(); finishing.set(ctx.store, operations); }
  const current = operations.get(roomId);
  if (current) return current;
  const operation = (async () => {
    const delivered = await deliverRoomResult({ host: ctx.host, store: ctx.store }, {
      roomId, finalResult: completion.summary, receipt: completion.receipt,
    });
    if (!delivered.ok && delivered.problems.length > 0) {
      ctx.host.notify('The Room finished, but its result was not delivered.', 'warning', {
        subtitle: record.definition.title, openApp: true,
      });
    }
    await releaseAuthority(ctx, roomId, completion.summary);
    await ctx.store.updateRoom(roomId, (fresh) => fresh.runtime.status === 'completing'
      ? withRoomStatus({ ...fresh, runtime: { ...fresh.runtime, completion: undefined },
          members: fresh.members.map((member) => withMemberStatus(member, 'completed', completion.summary)),
        }, 'completed', ctx.host.now(), null)
      : fresh);
  })().finally(() => operations.delete(roomId));
  operations.set(roomId, operation);
  return operation;
}

/** Close sessions and preserve work before revoking a finished Room's grant. */
export async function releaseAuthority(ctx: RoomLifecycleContext, roomId: string, detail: string): Promise<void> {
  const record = await ctx.store.readRoom(roomId);
  if (!record) return;
  await ctx.sessions.releaseRoom(roomId);
  await ctx.workspaces.releaseRoom(roomId, detail).catch((error: unknown) => {
    ctx.host.log(`room ${roomId}: could not release member worktrees: ${String(error)}`);
    return [];
  });
  if (record.definition.grantId) {
    await requirePersistentSessions(ctx.host).revokeGrant(record.definition.grantId);
    await ctx.store.updateRoom(roomId, (current) => ({
      ...current, definition: { ...current.definition, grantId: null },
    }));
  }
  ctx.forgetSignals(roomId);
  await ctx.store.appendTimeline(roomId, [timelineEvent(ctx.host, roomId, 'room-status', null, detail)]);
  ctx.emit({ roomId, kind: 'room-status', memberId: null, detail });
}
