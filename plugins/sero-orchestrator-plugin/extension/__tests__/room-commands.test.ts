import { describe, expect, it, vi } from 'vitest';
import type { RoomCommandRouter } from '../../runtime/rooms/room-command-router';
import { buildRoomCommandInput, executeRoomCommand } from '../room-commands';

const member = {
  key: 'reviewer',
  displayName: 'Reviewer',
  role: 'Reviewer',
  responsibility: 'Review the change.',
  mandate: 'Check the implementation.',
  isConductor: false,
  model: 'test-model',
  thinking: 'medium',
  promptAdditions: [],
  tools: ['read'],
  skills: [],
  permissions: 'read-only',
  needsWorktree: false,
  reasonForInclusion: 'The change needs review.',
};

describe('Room revision proposal JSON', () => {
  it('rejects a non-numeric lower-soft-limit field', () => {
    const input = buildRoomCommandInput({
      command: 'propose-revision',
      proposalJson: JSON.stringify({ kind: 'lower-soft-limit', field: 'allowedTools', value: 2 }),
    });

    expect(input).toEqual({
      error: 'proposalJson is invalid: lower-soft-limit proposal must contain a numeric soft-limit field and finite numeric value',
    });
  });

  it('rejects malformed request-expansion without routing or Room mutation', async () => {
    const execute = vi.fn();
    const room = { revisions: [] as string[] };
    execute.mockImplementation(() => {
      room.revisions.push('mutated');
      return { ok: true, text: 'changed', details: {} };
    });
    const router = { execute } as unknown as RoomCommandRouter;

    const result = await executeRoomCommand(
      {
        command: 'propose-revision',
        proposalJson: JSON.stringify({ kind: 'request-expansion', field: 'maxCostUsd', value: '100' }),
      },
      undefined,
      async () => router,
    );

    expect(result.text).toContain('request-expansion proposal must contain');
    expect(result.details.ok).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(room.revisions).toEqual([]);
  });

  it.each([
    { kind: 'add-member', member },
    { kind: 'update-mandate', memberId: 'reviewer', mandate: { priorities: ['quality'] } },
    { kind: 'assign-work', memberId: 'reviewer', task: 'Review it', priorities: ['quality'] },
    { kind: 'change-strategy', strategy: 'Review before merge.' },
    { kind: 'change-configuration', memberId: 'reviewer', configuration: { tools: ['read'] } },
    { kind: 'suspend-member', memberId: 'reviewer' },
    { kind: 'resume-member', memberId: 'reviewer' },
    { kind: 'retire-member', memberId: 'reviewer' },
    { kind: 'replace-member', memberId: 'reviewer', replacement: member, handover: 'Review is pending.' },
    { kind: 'lower-soft-limit', field: 'maxCostUsd', value: 5 },
    { kind: 'request-expansion', field: 'maxCostUsd', value: 25 },
  ])('accepts a valid $kind proposal', (proposal) => {
    expect(buildRoomCommandInput({
      command: 'propose-revision',
      proposalJson: JSON.stringify(proposal),
    })).toMatchObject({ proposal });
  });
});
