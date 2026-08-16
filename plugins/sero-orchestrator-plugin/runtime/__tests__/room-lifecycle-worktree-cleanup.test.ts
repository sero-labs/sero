import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RoomCoordinator } from '../rooms/room-coordinator';
import type { RoomStore } from '../rooms/room-store';
import type { FakeHost } from './fake-host';
import {
  createRoomHarness,
  disposeHarness,
  draftRoomIn,
  envelopeWith,
  member,
  waitFor,
} from './room-harness';

let dir: string;
let host: FakeHost;
let store: RoomStore;
let coordinator: RoomCoordinator;

beforeEach(async () => {
  ({ dir, host, store, coordinator } = await createRoomHarness());
});

afterEach(() => disposeHarness(dir));

async function editingRoom(): Promise<string> {
  return draftRoomIn(
    coordinator,
    envelopeWith({ workspacePolicy: { mode: 'worktree-per-member', sharedTreeApproved: false, claimPolicy: 'warn' } }),
    [
      member({ tools: ['read', 'write'], permissions: 'edit-workspace', needsWorktree: true }),
      member({
        key: 'impl', displayName: 'Implementer', role: 'Implementer', isConductor: false,
        tools: ['read', 'write'], permissions: 'edit-workspace', needsWorktree: true,
      }),
    ],
  );
}

const keysFor = (roomId: string) => [`room-${roomId}-lead`, `room-${roomId}-impl`].sort();

describe('terminal worktree cleanup', () => {
  it('preserves and releases every editing worktree on completion', async () => {
    const roomId = await editingRoom();
    await coordinator.startRoom(roomId);
    await waitFor(async () => (await store.readMember(roomId, 'lead'))?.usage.turns === 1, 'the first turn');

    const completed = await coordinator.completeRoom(roomId, 'Done.');

    expect(completed.ok).toBe(true);
    expect(host.checkpoints).toHaveLength(2);
    expect(host.worktreesRemoved.sort()).toEqual(keysFor(roomId));
    expect((await store.readRoom(roomId))?.members.every((entry) => entry.worktreePath === null)).toBe(true);
  });

  it('preserves and releases every editing worktree on cancel', async () => {
    const roomId = await editingRoom();
    host.persistentSessions.mode = 'manual';
    await coordinator.startRoom(roomId);
    await waitFor(() => host.persistentSessions.openTurns().includes('lead'), 'the Conductor turn');

    const cancelled = await coordinator.cancelRoom(roomId);

    expect(cancelled.ok).toBe(true);
    expect(host.checkpoints).toHaveLength(2);
    expect(host.worktreesRemoved.sort()).toEqual(keysFor(roomId));
    expect((await store.readRoom(roomId))?.members.every((entry) => entry.worktreePath === null)).toBe(true);
  });

  it('releases preserved worktrees before deleting the Room record', async () => {
    const roomId = await editingRoom();
    await coordinator.startRoom(roomId);

    const deleted = await coordinator.deleteRoom(roomId);

    expect(deleted.ok).toBe(true);
    expect(host.checkpoints).toHaveLength(2);
    expect(host.worktreesRemoved.sort()).toEqual(keysFor(roomId));
    expect(host.worktreeRemovals.every((entry) => entry.deleteMergedBranch && !entry.deleteBranch)).toBe(true);
    expect(await store.readRoom(roomId)).toBeNull();
  });

  it('keeps failed worktree cleanup addressable and retries it on Delete', async () => {
    const roomId = await editingRoom();
    await coordinator.startRoom(roomId);
    const leadPath = (await store.readMember(roomId, 'lead'))?.worktreePath;
    if (!leadPath) throw new Error('the lead has no worktree');
    host.checkpointFailures.set(leadPath, 'the index is locked');

    const cancelled = await coordinator.cancelRoom(roomId);

    expect(cancelled.ok).toBe(true);
    expect(host.persistentSessions.revoked).toEqual(['grant-1']);
    expect((await store.readMember(roomId, 'lead'))?.worktreePath).toBe(leadPath);
    expect(host.worktreesRemoved).not.toContain(`room-${roomId}-lead`);

    const refusedDelete = await coordinator.deleteRoom(roomId);
    expect(refusedDelete.ok).toBe(false);
    expect(await store.readRoom(roomId)).not.toBeNull();

    host.checkpointFailures.delete(leadPath);
    const deleted = await coordinator.deleteRoom(roomId);

    expect(deleted.ok).toBe(true);
    expect(host.worktreesRemoved).toContain(`room-${roomId}-lead`);
    expect(await store.readRoom(roomId)).toBeNull();
  });
});
