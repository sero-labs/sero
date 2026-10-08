import { describe, expect, it } from 'vitest';
import { memberSessionRequest, memberSubjectPolicy } from '../rooms/member-grant';
import type { OrchestratorHost } from '../host';
import { MEMBERS, blueprintMember, envelopeWith, roomFixture } from './room-member-fixtures';

const host = { workspacePath: '/workspaces/ws-1' } as OrchestratorHost;

describe('a Room member approved for Code Mode', () => {
  const members = [
    ...MEMBERS.filter((member) => member.key === 'lead'),
    blueprintMember({ key: 'reader', displayName: 'Reader', role: 'Reader', isConductor: false, tools: ['read', 'codemode'], permissions: 'read-only' }),
  ];
  const room = roomFixture(envelopeWith({ allowedTools: ['read', 'write', 'codemode'] }), members);
  const reader = room.members.find((member) => member.id === 'reader');
  if (!reader) throw new Error('fixture has no reader');

  it('asks for it in the approval and the session request, and only that member does', () => {
    expect(memberSubjectPolicy(host, room, reader).allowedTools).toContain('codemode');
    expect(memberSessionRequest(host, { ...room, definition: { ...room.definition, grantId: 'g' } }, reader, 'create').tools).toContain('codemode');
    const lead = room.members.find((member) => member.id === 'lead');
    if (!lead) throw new Error('fixture has no lead');
    expect(memberSubjectPolicy(host, room, lead).allowedTools).not.toContain('codemode');
  });

  it('stays read-only: the approval holds no write tool and no write access', () => {
    const policy = memberSubjectPolicy(host, room, reader);
    expect(policy.allowedTools).not.toContain('write');
    expect(policy.permissionProfile.filesystem).toBe('read');
  });
});
