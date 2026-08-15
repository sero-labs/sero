import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { scheduleRoomTurns, type ReadySignal } from '../rooms/room-scheduler';
import { blueprintMember, envelopeWith, roomFixture } from './room-member-fixtures';

describe('Room scheduler performance', () => {
  it('serves equal-priority members oldest-first without scheduler growth', () => {
    const members = [
      blueprintMember({ key: 'lead', isConductor: true }),
      ...Array.from({ length: 20 }, (_, index) =>
        blueprintMember({ key: `member-${index}`, isConductor: false, role: 'Worker' })),
    ];
    const fixture = roomFixture(envelopeWith({ maxMembers: 24, maxActiveTurns: 5 }), members);
    const room = {
      ...fixture,
      runtime: { ...fixture.runtime, status: 'running' as const },
      members: fixture.members.map((member) => ({ ...member, status: 'idle' as const })),
    };
    const signals: ReadySignal[] = members.map((member, index) => ({
      memberId: member.key,
      reason: 'assigned-work',
      at: new Date(index * 1_000).toISOString(),
    }));

    const startedAt = performance.now();
    let decision = scheduleRoomTurns(room, signals, Date.parse(room.definition.createdAt));
    for (let pass = 0; pass < 10_000; pass += 1) {
      decision = scheduleRoomTurns(room, signals, Date.parse(room.definition.createdAt));
    }
    const durationMs = performance.now() - startedAt;

    expect(decision.start.map((turn) => turn.memberId)).toEqual([
      'lead', 'member-0', 'member-1', 'member-2', 'member-3',
    ]);
    expect(durationMs).toBeLessThan(1_000);
  });
});
