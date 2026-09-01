import { describe, expect, it } from 'vitest';
import type { PersistentSessionContextUsage } from '@sero-ai/common';
import type { RoomTimelineEvent, WorkItem } from '../../shared/room-message-types';
import type { Room, RoomMember, MemberStatus } from '../../shared/room-types';
import type { RoomBlueprint, RoomProposalSummary, OperatingEnvelope } from '../../shared/room-blueprint-types';
import {
  compactMemberAtSafeBoundary,
  contextRatio,
  describeContextPressure,
  isAtSafeBoundary,
  shouldCompact,
  type RoomContextDeps,
} from '../rooms/room-context';

const usage = (usedTokens: number, maxTokens: number): PersistentSessionContextUsage =>
  ({ usedTokens, maxTokens });

function member(status: MemberStatus, liveHandleId: string | null = 'h1'): RoomMember {
  return {
    id: 'm1', roomId: 'room-a', displayName: 'Ada', isConductor: false, responsibility: 'Implements',
    status, statusDetail: '', statusAt: '2026-01-01T00:00:00.000Z',
    mandate: {
      role: 'implementer', responsibilities: 'code', currentTask: 'Fix the parser',
      priorities: [], workingInstructions: 'Work in small commits.', revision: 3, updatedAt: 't',
    },
    configuration: {
      model: 'm', thinking: 'off', promptAdditions: [], tools: [], skills: [],
      permissions: 'edit-workspace', needsWorktree: false, revision: 2,
    },
    session: {
      subject: 'm1', grantedTools: null, sessionId: 's1', sessionPath: '/s/m1.jsonl', workspaceId: 'w',
      liveHandleId, lastOpenedAt: 't', lastClosedAt: null, compactionCount: 1, lastCompactedAt: null,
    },
    usage: { costUsd: 1.5, inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, turns: 4, retries: 0, consecutiveFailures: 0 },
    worktreePath: null, worktreeBranch: null, worktreeSlotId: null, worktreeLeaseId: null,
    waitingOnQuestionId: null, replacedByMemberId: null,
    createdAt: 't', retiredAt: null,
  };
}

function room(current: RoomMember): Room {
  return {
    definition: {
      id: 'room-a', title: 'Parser rescue', problemStatement: 'p',
      blueprint: {} as unknown as RoomBlueprint, proposal: {} as unknown as RoomProposalSummary,
      envelope: {} as unknown as OperatingEnvelope,
      workspacePolicy: { mode: 'read-only-shared', sharedTreeApproved: false, claimPolicy: 'warn' },
      grantId: 'g1', createdAt: 't', updatedAt: 't',
    },
    runtime: {
      status: 'running', startedAt: 't', endedAt: null, activeMemberIds: [],
      usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, turns: 0, rosterRevisions: 0, memberReplacements: 0 },
      stopReason: null, messageSequence: 0, timelineSequence: 0, appliedCommandIds: [], lastProgressAt: null,
    },
    members: [current],
    brief: {
      objective: 'Ship the parser fix', successCriteria: ['Tests pass'], decisions: ['Ada: use the streaming path'],
      activeWork: [], blockers: [], openQuestions: ['Which encoding do we accept?'],
      artifactRefs: ['/state/rooms/room-a/artifacts/plan.md'], updatedAt: 't',
      conductorNote: null, conductorNoteAt: null,
    },
    delivery: { destination: 'saved-artifact', params: {}, originSessionId: null, originWorkspaceId: null, deliveredAt: null, deliveryRef: null, originReturnedAt: null, originReturnRef: null },
    archivedAt: null,
  };
}

const work: WorkItem[] = [{
  id: 'w1', roomId: 'room-a', title: 'Fix the parser', ownerMemberId: 'm1', status: 'in-progress',
  notes: '', dependsOnWorkIds: [], artifactRefs: [], createdAt: 't', updatedAt: 't',
}];

interface Harness {
  deps: RoomContextDeps;
  calls: string[];
  timeline: RoomTimelineEvent[];
  members: RoomMember[];
  artifacts: Map<string, string>;
}

function harness(options: { compactFails?: string; usage?: PersistentSessionContextUsage } = {}): Harness {
  const calls: string[] = [];
  const timeline: RoomTimelineEvent[] = [];
  const members: RoomMember[] = [];
  const artifacts = new Map<string, string>();
  let ids = 0;

  const deps: RoomContextDeps = {
    sessions: {
      getContextUsage: async () => {
        calls.push('getContextUsage');
        return options.usage ?? usage(900, 1000);
      },
      compact: async () => {
        calls.push('compact');
        if (options.compactFails) throw new Error(options.compactFails);
      },
    },
    store: {
      updateMember: async (_roomId, _memberId, updater) => {
        calls.push('updateMember');
        members.push(updater(member('idle')));
      },
      appendTimeline: async (_roomId, events) => {
        calls.push('appendTimeline');
        timeline.push(...events);
      },
    },
    host: {
      writeArtifact: async (relativePath, content) => {
        calls.push(`writeArtifact:${relativePath}`);
        const ref = `/state/${relativePath}`;
        artifacts.set(ref, content);
        return ref;
      },
      now: () => '2026-01-01T00:00:00.000Z',
      newId: (prefix) => `${prefix}_${(ids += 1)}`,
      log: () => undefined,
    },
  };
  return { deps, calls, timeline, members, artifacts };
}

describe('context pressure', () => {
  it('warns before the compaction threshold', () => {
    expect(shouldCompact(usage(500, 1000))).toBe('ok');
    expect(shouldCompact(usage(720, 1000))).toBe('warn');
    expect(shouldCompact(usage(900, 1000))).toBe('compact');
  });

  it('treats an unusable window as no pressure', () => {
    // A zero max would read as 100% full and compact on every turn forever.
    expect(contextRatio(usage(10, 0))).toBe(0);
    expect(shouldCompact(usage(10, 0))).toBe('ok');
  });

  it('describes the warning in plain English and stays silent below it', () => {
    expect(describeContextPressure(member('idle'), usage(100, 1000))).toBeNull();
    expect(describeContextPressure(member('idle'), usage(750, 1000))).toContain('75%');
  });
});

describe('safe boundary', () => {
  it('refuses to compact a member that holds an execution slot', async () => {
    const { deps, calls } = harness();
    const working = member('working');
    const outcome = await compactMemberAtSafeBoundary(deps, { room: room(working), member: working, work });

    expect(outcome.compacted).toBe(false);
    expect(outcome.skipped).toBe('mid-turn');
    // Nothing was asked of the host: a mid-turn compaction would drop the
    // context of the call in flight.
    expect(calls).toEqual([]);
  });

  it('skips a member with no live session', async () => {
    const { deps, calls } = harness();
    const disposed = member('idle', null);
    const outcome = await compactMemberAtSafeBoundary(deps, { room: room(disposed), member: disposed, work });

    expect(outcome.skipped).toBe('no-live-session');
    expect(calls).toEqual([]);
  });

  it('accepts every status that holds no slot', () => {
    expect(isAtSafeBoundary(member('waiting'))).toBe(true);
    expect(isAtSafeBoundary(member('starting'))).toBe(false);
  });

  it('leaves a member under the threshold alone', async () => {
    const { deps, calls } = harness({ usage: usage(100, 1000) });
    const idle = member('idle');
    const outcome = await compactMemberAtSafeBoundary(deps, { room: room(idle), member: idle, work });

    expect(outcome.skipped).toBe('below-threshold');
    expect(calls).toEqual(['getContextUsage']);
  });
});

describe('compaction', () => {
  it('checkpoints before compacting and re-primes the next turn', async () => {
    const { deps, calls, timeline, members, artifacts } = harness();
    const idle = member('idle');
    const outcome = await compactMemberAtSafeBoundary(deps, { room: room(idle), member: idle, work });

    expect(outcome.compacted).toBe(true);
    // The checkpoint must exist before the transcript it describes is discarded.
    expect(calls.indexOf('writeArtifact:rooms/room-a/checkpoints/m1-2.md')).toBeLessThan(calls.indexOf('compact'));

    const checkpoint = artifacts.get('/state/rooms/room-a/checkpoints/m1-2.md') ?? '';
    expect(checkpoint).toContain('Work in small commits.');
    expect(checkpoint).toContain('Which encoding do we accept?');
    expect(checkpoint).toContain('Mandate revision: 3');

    // The next turn carries brief, mandate, open questions and artifact refs.
    expect(outcome.reprime).toContain('Ship the parser fix');
    expect(outcome.reprime).toContain('Work in small commits.');
    expect(outcome.reprime).toContain('Which encoding do we accept?');
    expect(outcome.reprime).toContain('/state/rooms/room-a/artifacts/plan.md');

    expect(members[0].session.compactionCount).toBe(2);
    expect(members[0].session.lastCompactedAt).toBe('2026-01-01T00:00:00.000Z');

    expect(timeline).toHaveLength(1);
    expect(timeline[0].kind).toBe('compaction');
    expect(timeline[0].details?.checkpointRef).toBe('/state/rooms/room-a/checkpoints/m1-2.md');
    // A compaction rewrites the prompt prefix, so no cache assumption survives.
    expect(timeline[0].details?.promptCacheInvalidated).toBe(true);
    expect(outcome.promptCacheInvalidated).toBe(true);
  });

  it('reports a failed compaction instead of claiming one', async () => {
    const { deps, timeline, members } = harness({ compactFails: 'window locked' });
    const idle = member('idle');
    const outcome = await compactMemberAtSafeBoundary(deps, { room: room(idle), member: idle, work });

    expect(outcome.compacted).toBe(false);
    expect(outcome.failure).toBe('window locked');
    expect(outcome.promptCacheInvalidated).toBe(false);
    // The counter must not move, and the timeline must say what happened so the
    // caller can pause the member before its window is exhausted.
    expect(members).toHaveLength(0);
    expect(timeline[0].details?.error).toBe('window locked');
  });
});
