import { describe, expect, it } from 'vitest';
import type { RoomArtifact } from '../../shared/room-message-types';
import type { PersistedRoom, RoomMember } from '../../shared/room-types';
import { deliveredLine, otherArtifacts, pickPlan, resultLine } from '../lib/room-result';

function artifact(id: string, kind: RoomArtifact['kind'], by: string, createdAt: string): RoomArtifact {
  return { id, roomId: 'room_1', kind, title: `title ${id}`, ref: `${id}.md`, producedByMemberId: by, relatedWorkId: null, createdAt };
}

function member(id: string, conductor = false): RoomMember {
  return { id, displayName: id, isConductor: conductor } as unknown as RoomMember;
}

function room(artifacts: RoomArtifact[], delivery: Partial<PersistedRoom['delivery']> = {}): PersistedRoom {
  return {
    artifacts,
    memberIds: ['lead', 'other'],
    delivery: { destination: 'workspace-files', deliveredAt: null, deliveryRef: null, ...delivery },
  } as unknown as PersistedRoom;
}

const members = new Map<string, RoomMember>([['lead', member('lead', true)], ['other', member('other')]]);

describe('pickPlan', () => {
  it('shows the Conductor\'s plan ahead of a newer one from anyone else', () => {
    const chosen = pickPlan(room([
      artifact('artifact_new', 'plan', 'other', '2026-09-16T22:00:00.000Z'),
      artifact('artifact_lead', 'plan', 'lead', '2026-09-16T10:00:00.000Z'),
    ]), members);
    expect(chosen?.id).toBe('artifact_lead');
  });

  it('falls back to the newest plan when the Conductor published none', () => {
    const chosen = pickPlan(room([
      artifact('artifact_old', 'plan', 'other', '2026-09-16T10:00:00.000Z'),
      artifact('artifact_new', 'plan', 'other', '2026-09-16T22:00:00.000Z'),
    ]), members);
    expect(chosen?.id).toBe('artifact_new');
  });

  it('shows no plan when the Room published none, rather than a report dressed as one', () => {
    expect(pickPlan(room([artifact('artifact_r', 'report', 'lead', '2026-09-16T10:00:00.000Z')]), members)).toBeNull();
    expect(pickPlan(room([]), members)).toBeNull();
  });
});

describe('resultLine', () => {
  const plan = artifact('artifact_plan', 'plan', 'lead', '2026-09-16T10:00:00.000Z');

  it('drops the pointer to the plan only when that same plan is on the page', () => {
    const closing = 'Delivered and reviewed the direction. Final plan: artifact_plan';
    expect(resultLine(closing, plan)).toBe('Delivered and reviewed the direction.');
  });

  it('keeps the pointer when it names a different artifact', () => {
    const closing = 'Delivered and reviewed the direction. Final plan: artifact_other';
    expect(resultLine(closing, plan)).toBe(closing);
  });

  it('keeps a closing line that points at nothing', () => {
    expect(resultLine('Delivered and reviewed the direction.', plan)).toBe('Delivered and reviewed the direction.');
  });

  it('keeps the whole line when there is no plan to show', () => {
    const closing = 'Delivered and reviewed the direction. Final plan: artifact_plan';
    expect(resultLine(closing, null)).toBe(closing);
  });

  it('keeps the line when dropping the pointer would leave nothing', () => {
    expect(resultLine('Final plan: artifact_plan', plan)).toBe('Final plan: artifact_plan');
  });
});

describe('deliveredLine', () => {
  it('names where the result went and when', () => {
    const line = deliveredLine(room([], { deliveredAt: '2026-09-16T22:13:07.440Z', deliveryRef: 'ref-1' }));
    // The record's destination id, opened out, and a stamp short enough to read.
    expect(line.text).toContain('To workspace files');
    expect(line.text).toContain('16 Sep');
    expect(line.text).not.toContain('2026');
    expect(line.ref).toBe('ref-1');
  });

  it('says nothing was delivered rather than showing a destination it never reached', () => {
    const line = deliveredLine(room([], { deliveredAt: null }));
    expect(line.text).toContain('Not delivered to workspace files');
    expect(line.ref).toBeNull();
  });
});

describe('otherArtifacts', () => {
  it('leaves out only the plan shown in place', () => {
    const plan = artifact('artifact_plan', 'plan', 'lead', '2026-09-16T10:00:00.000Z');
    const report = artifact('artifact_r', 'report', 'other', '2026-09-16T11:00:00.000Z');
    expect(otherArtifacts(room([plan, report]), plan).map((item) => item.id)).toEqual(['artifact_r']);
    expect(otherArtifacts(room([plan, report]), null).map((item) => item.id)).toEqual(['artifact_plan', 'artifact_r']);
  });
});
