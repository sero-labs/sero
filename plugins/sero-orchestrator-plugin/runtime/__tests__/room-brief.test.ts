/**
 * Who a decision reaches (spec architect-resilience).
 *
 * Applicability comes from the record, not from reading a display name out of a
 * sentence. A decision that relates to one member's work reaches that member; a
 * decision that relates to no single item concerns the whole Room and reaches
 * everyone, including members it never names.
 */

import { describe, expect, it } from 'vitest';
import type { RoomArtifact, WorkItem } from '../../shared/room-message-types';
import type { RoomBrief, RoomMember } from '../../shared/room-types';
import { buildRoomBrief, projectBriefForMember } from '../rooms/room-brief';

function member(id: string, displayName: string, isConductor = false): RoomMember {
  return {
    id, roomId: 'room-a', displayName, isConductor, responsibility: 'works', status: 'working',
    statusDetail: '', statusAt: 't',
    mandate: { role: 'r', responsibilities: 'code', currentTask: 'task', priorities: [], workingInstructions: 'Work in small commits.', revision: 1, updatedAt: 't' },
    configuration: { model: 'm', thinking: 'off', promptAdditions: [], tools: [], skills: [], permissions: 'edit-workspace', needsWorktree: false, revision: 1 },
    session: { subject: id, grantedTools: null, sessionId: null, sessionPath: null, workspaceId: 'w', liveHandleId: null, lastOpenedAt: null, lastClosedAt: null, compactionCount: 0, lastCompactedAt: null },
    usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, turns: 0, retries: 0, consecutiveFailures: 0 },
    worktreePath: null, worktreeBranch: null, waitingOnQuestionId: null, replacedByMemberId: null,
    createdAt: 't', retiredAt: null,
  };
}

function brief(overrides: Partial<RoomBrief> = {}): RoomBrief {
  return {
    objective: 'Ship the parser fix',
    successCriteria: ['Tests pass'],
    decisions: [],
    activeWork: [],
    blockers: [],
    openQuestions: [],
    artifactRefs: [],
    updatedAt: 't',
    conductorNote: null,
    conductorNoteAt: null,
    ...overrides,
  };
}

const work = (id: string, ownerMemberId: string): WorkItem => ({
  id, roomId: 'room-a', title: 'Fix the parser', ownerMemberId, status: 'in-progress',
  notes: '', dependsOnWorkIds: [], artifactRefs: [], createdAt: 't', updatedAt: 't',
});

const decision = (id: string, title: string, relatedWorkId: string | null): RoomArtifact => ({
  id, roomId: 'room-a', kind: 'decision', title, ref: `/a/${id}.md`,
  producedByMemberId: 'ada', relatedWorkId, createdAt: 't',
});

/** The Room fields `buildRoomBrief` reads, and nothing else. */
const roomStub = (): Parameters<typeof buildRoomBrief>[0] => ({
  members: [],
  brief: { conductorNote: null, conductorNoteAt: null },
  definition: { blueprint: { objective: 'Ship the parser fix', successCriteria: ['Tests pass'] } },
}) as unknown as Parameters<typeof buildRoomBrief>[0];

describe('which decisions a member receives', () => {
  it('gives an unnamed decision to every member, not to nobody', () => {
    const ada = member('ada', 'Ada');
    const grace = member('grace', 'Grace');
    const shared = brief({ decisions: [{ title: 'Ship on Friday', memberId: null }] });
    expect(projectBriefForMember(shared, ada, []).relevantDecisions).toEqual(['Ship on Friday']);
    expect(projectBriefForMember(shared, grace, []).relevantDecisions).toEqual(['Ship on Friday']);
  });

  it('gives a decision to the member whose work it relates to, and to nobody else', () => {
    const ada = member('ada', 'Ada');
    const grace = member('grace', 'Grace');
    const scoped = brief({ decisions: [{ title: 'Use the streaming path', memberId: 'ada' }] });
    expect(projectBriefForMember(scoped, ada, []).relevantDecisions).toEqual(['Use the streaming path']);
    expect(projectBriefForMember(scoped, grace, []).relevantDecisions).toEqual([]);
  });

  it('does not decide relevance by finding a name inside the sentence', () => {
    // A decision that merely happens to contain a member's name stays global,
    // and one that concerns a member without naming it still reaches them.
    const sam = member('sam', 'Sam');
    const samantha = member('samantha', 'Samantha');
    const prose = brief({ decisions: [{ title: 'Ask Samantha to review', memberId: null }] });
    expect(projectBriefForMember(prose, sam, []).relevantDecisions).toHaveLength(1);
    expect(projectBriefForMember(prose, samantha, []).relevantDecisions).toHaveLength(1);

    const unnamed = brief({ decisions: [{ title: 'Rework the lexer', memberId: 'samantha' }] });
    expect(projectBriefForMember(unnamed, samantha, []).relevantDecisions).toEqual(['Rework the lexer']);
    expect(projectBriefForMember(unnamed, sam, []).relevantDecisions).toEqual([]);
  });

  it('gives a blocker only to the member that has it', () => {
    const sam = member('sam', 'Sam');
    const samantha = member('samantha', 'Samantha');
    const blocked = brief({ blockers: ['Sam: needs the schema', 'Samantha: needs the corpus'] });
    const forSam = projectBriefForMember(blocked, sam, []).relevantBlockers;
    expect(forSam).toEqual(['Sam: needs the schema']);
    expect(projectBriefForMember(blocked, samantha, []).relevantBlockers).toEqual(['Samantha: needs the corpus']);
  });

  it('gives the conductor the whole brief, because coordinating is its work', () => {
    const conductor = member('con', 'Conductor', true);
    const full = brief({
      decisions: [{ title: 'A', memberId: null }, { title: 'B', memberId: 'ada' }],
      blockers: ['Ada: waiting'],
    });
    const projection = projectBriefForMember(full, conductor, []);
    expect(projection.relevantDecisions).toEqual(['A', 'B']);
    expect(projection.relevantBlockers).toEqual(['Ada: waiting']);
  });
});

describe('where applicability comes from', () => {
  it('takes it from the work a decision relates to, or treats it as global', () => {
    const built = buildRoomBrief(
      roomStub(),
      {
        work: [work('w1', 'ada')],
        artifacts: [decision('a1', 'Scoped to Ada', 'w1'), decision('a2', 'Whole Room', null)],
        openQuestions: [],
      },
      't',
    );
    expect(built.decisions).toEqual([
      { title: 'Scoped to Ada', memberId: 'ada' },
      { title: 'Whole Room', memberId: null },
    ]);
  });

  it('treats a decision about work nobody owns as global rather than dropping it', () => {
    const built = buildRoomBrief(
      roomStub(),
      { work: [], artifacts: [decision('a1', 'Orphaned', 'w-gone')], openQuestions: [] },
      't',
    );
    expect(built.decisions).toEqual([{ title: 'Orphaned', memberId: null }]);
  });
});
