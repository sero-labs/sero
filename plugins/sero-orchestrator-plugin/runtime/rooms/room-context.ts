/**
 * Member context management and compaction (spec §15.2, FR-039).
 *
 * A member session lives for the whole Room, so its context window fills. Three
 * rules make that survivable:
 *
 *  - **Compaction only at a safe turn boundary.** Compacting mid-turn would drop
 *    the context of the call in flight — the member would come back to a tool
 *    result it can no longer explain, which is worse than a full window.
 *  - **The record survives outside the transcript.** A checkpoint is written
 *    BEFORE compaction and the next turn is re-primed from current Room records,
 *    so nothing load-bearing lives only in the window being discarded.
 *  - **The checkpoint is computed, never generated.** Pi's own compaction already
 *    summarises the transcript; a second model-authored summary could contradict
 *    the records the runtime actually enforces.
 *
 * A compaction rewrites the prompt prefix, so every prompt-cache assumption for
 * that member is void afterwards (spec §24.2). That is reported in the outcome
 * and recorded in the timeline rather than assumed by the caller.
 */

import type { PersistentSessionContextUsage, PersistentSessionsApi } from '@sero-ai/common';
import type { RoomTimelineEvent, WorkItem } from '../../shared/room-message-types';
import type { Room, RoomMember } from '../../shared/room-types';
import { IDLE_MEMBER_STATUSES } from '../../shared/room-types';
import type { OrchestratorHost } from '../host';
import { projectBriefForMember, renderMemberBrief } from './room-brief';
import type { RoomStore } from './room-store';

/** Window fractions that drive the warning and the compaction. */
export interface ContextThresholds {
  /** Where the UI starts showing the compaction coming. */
  warnRatio: number;
  /** Where the next safe boundary compacts. */
  compactRatio: number;
}

export const DEFAULT_CONTEXT_THRESHOLDS: ContextThresholds = {
  warnRatio: 0.7,
  compactRatio: 0.85,
};

export type ContextPressure = 'ok' | 'warn' | 'compact';

/** How full the window is, 0..1. */
export function contextRatio(usage: PersistentSessionContextUsage): number {
  // An absent or zero window would read as 100% full and compact on every turn
  // forever, so an unusable reading counts as no pressure at all.
  if (usage.maxTokens <= 0) return 0;
  return Math.min(1, usage.usedTokens / usage.maxTokens);
}

/**
 * The pressure level for a usage reading. `warn` exists so the UI can show the
 * compaction coming instead of a session apparently stalling for a moment.
 */
export function shouldCompact(
  usage: PersistentSessionContextUsage,
  thresholds: ContextThresholds = DEFAULT_CONTEXT_THRESHOLDS,
): ContextPressure {
  const ratio = contextRatio(usage);
  if (ratio >= thresholds.compactRatio) return 'compact';
  if (ratio >= thresholds.warnRatio) return 'warn';
  return 'ok';
}

/**
 * One plain-English line for the UI, or null when there is nothing to say.
 * Deliberately not written to the timeline: a warning that repeats every turn
 * would fill an append-only file with noise, and pressure is derived state the
 * UI can read live.
 */
export function describeContextPressure(
  member: RoomMember,
  usage: PersistentSessionContextUsage,
  thresholds: ContextThresholds = DEFAULT_CONTEXT_THRESHOLDS,
): string | null {
  const pressure = shouldCompact(usage, thresholds);
  if (pressure === 'ok') return null;
  const percent = Math.round(contextRatio(usage) * 100);
  return pressure === 'warn'
    ? `${member.displayName} has used ${percent}% of its context. It is compacted at the end of a turn.`
    : `${member.displayName} has used ${percent}% of its context. It compacts at the next safe point.`;
}

/**
 * Whether the member is between turns. Reuses the no-slot status list: a member
 * that holds no execution slot has no turn in flight, so there is no half-built
 * tool call for a compaction to strand.
 */
export function isAtSafeBoundary(member: RoomMember): boolean {
  return IDLE_MEMBER_STATUSES.includes(member.status);
}

/**
 * The checkpoint persisted before compaction. It is a projection of current Room
 * records — mandate, work, questions, artifacts, counters — so it can never
 * disagree with the state the runtime enforces, and the user can read exactly
 * what the member knew at the moment its window was cut.
 */
export function buildMemberCheckpoint(
  room: Room,
  member: RoomMember,
  work: WorkItem[],
  now: string,
): string {
  const projection = projectBriefForMember(room.brief, member, work);
  const lines = [
    `# Checkpoint — ${member.displayName}`,
    '',
    `Room: ${room.definition.title}`,
    `Taken: ${now}`,
    `Compaction: ${member.session.compactionCount + 1}`,
    `Mandate revision: ${member.mandate.revision}`,
    `Configuration revision: ${member.configuration.revision}`,
    '',
    '## Objective',
    projection.objective,
    '',
    '## Mandate',
    member.mandate.workingInstructions,
    '',
    `## Current task`,
    member.mandate.currentTask || '(none assigned)',
  ];

  appendList(lines, 'Your work', projection.yourWork);
  appendList(lines, 'Open questions', room.brief.openQuestions);
  appendList(lines, 'Artifacts', projection.artifactRefs);
  appendList(lines, 'Decisions that affect you', projection.relevantDecisions);

  lines.push(
    '',
    '## Counters',
    `Turns: ${member.usage.turns}`,
    `Cost: $${member.usage.costUsd.toFixed(2)}`,
    `Tokens: ${member.usage.inputTokens + member.usage.outputTokens}`,
  );
  return lines.join('\n');
}

/**
 * The block the member's next turn must carry after a compaction: the Room
 * brief projection, its mandate, the open questions and the artifact refs.
 *
 * It is COMPUTED from current records rather than queued as a pending message,
 * which is what makes it survive a crash between the compaction and the next
 * turn — the same block is rebuilt from state whenever that turn is assembled.
 */
export function buildPostCompactionContext(room: Room, member: RoomMember, work: WorkItem[]): string {
  const projection = projectBriefForMember(room.brief, member, work);
  const lines = [
    '## Context was compacted',
    'Your earlier messages were summarised to free space. The Room record below is authoritative — trust it over anything you remember.',
    '',
    renderMemberBrief(projection),
  ];
  appendList(lines, 'Open questions', room.brief.openQuestions);
  appendList(lines, 'Artifacts', projection.artifactRefs);
  return lines.join('\n');
}

function appendList(lines: string[], heading: string, items: string[]): void {
  if (items.length === 0) return;
  lines.push('', `## ${heading}`, ...items.map((item) => `- ${item}`));
}

export interface RoomContextDeps {
  sessions: Pick<PersistentSessionsApi, 'getContextUsage' | 'compact'>;
  /** The runtime is the single writer of Room state; every write goes here. */
  store: Pick<RoomStore, 'updateMember' | 'appendTimeline'>;
  host: Pick<OrchestratorHost, 'writeArtifact' | 'now' | 'newId' | 'log'>;
}

export interface CompactionRequest {
  room: Room;
  member: RoomMember;
  /** Work items the member's brief projection is built from. */
  work: WorkItem[];
  /** Reading the caller already took this turn. Fetched from the host when absent. */
  usage?: PersistentSessionContextUsage;
  thresholds?: ContextThresholds;
}

export type CompactionSkip = 'no-live-session' | 'mid-turn' | 'below-threshold';

export interface CompactionOutcome {
  compacted: boolean;
  /** Why nothing happened. Absent when the member was compacted. */
  skipped?: CompactionSkip;
  /** Set when the host refused or failed. The caller pauses the member (§30). */
  failure?: string;
  checkpointRef: string | null;
  /** The block the member's next turn must carry. Always returned. */
  reprime: string;
  /** True only after a real compaction: the prompt prefix changed (§24.2). */
  promptCacheInvalidated: boolean;
  /** The reading the decision used, so the caller can show pressure without a second read. */
  usage: PersistentSessionContextUsage | null;
}

/**
 * Compacts a member's session when it is over the threshold AND between turns.
 *
 * Returns rather than throws for every expected outcome, because the caller's
 * response differs per case: a skip is normal, while a failure must pause the
 * member before its window is exhausted (§30).
 */
export async function compactMemberAtSafeBoundary(
  deps: RoomContextDeps,
  request: CompactionRequest,
): Promise<CompactionOutcome> {
  const { room, member, work } = request;
  const reprime = buildPostCompactionContext(room, member, work);
  const base = { checkpointRef: null, reprime, promptCacheInvalidated: false };

  const handleId = member.session.liveHandleId;
  if (!handleId) return { ...base, compacted: false, skipped: 'no-live-session', usage: null };
  if (!isAtSafeBoundary(member)) return { ...base, compacted: false, skipped: 'mid-turn', usage: null };

  const usage = request.usage ?? (await deps.sessions.getContextUsage(handleId));
  if (shouldCompact(usage, request.thresholds) !== 'compact') {
    return { ...base, compacted: false, skipped: 'below-threshold', usage };
  }

  const roomId = room.definition.id;
  const at = deps.host.now();
  const count = member.session.compactionCount + 1;
  // Written first: after the compaction the transcript this describes is gone.
  const checkpointRef = await deps.host.writeArtifact(
    `rooms/${roomId}/checkpoints/${member.id}-${count}.md`,
    buildMemberCheckpoint(room, member, work, at),
  );

  const failure = await deps.sessions
    .compact(handleId)
    .then(() => null)
    .catch((error: unknown) => (error instanceof Error ? error.message : String(error)));

  const details: Record<string, string | number | boolean> = {
    usedTokens: usage.usedTokens,
    maxTokens: usage.maxTokens,
    percentUsed: Math.round(contextRatio(usage) * 100),
    compactionCount: count,
    checkpointRef,
    promptCacheInvalidated: failure === null,
  };

  if (failure !== null) {
    deps.host.log(`room ${roomId}: compaction failed for ${member.id}: ${failure}`);
    await deps.store.appendTimeline(roomId, [
      timelineEvent(deps, roomId, member, at, `Could not compact ${member.displayName}'s context.`, {
        ...details,
        error: failure,
      }),
    ]);
    return { ...base, compacted: false, failure, checkpointRef, usage };
  }

  // Member record before timeline: a crash in between under-reports the count in
  // diagnostics, which is the harmless direction — the opposite order could claim
  // a compaction the member never had.
  await deps.store.updateMember(roomId, member.id, (current) => ({
    ...current,
    session: { ...current.session, compactionCount: count, lastCompactedAt: at },
  }));
  await deps.store.appendTimeline(roomId, [
    timelineEvent(
      deps,
      roomId,
      member,
      at,
      `Compacted ${member.displayName}'s context at ${details.percentUsed}% full.`,
      details,
    ),
  ]);

  return { compacted: true, checkpointRef, reprime, promptCacheInvalidated: true, usage };
}

function timelineEvent(
  deps: RoomContextDeps,
  roomId: string,
  member: RoomMember,
  at: string,
  summary: string,
  details: Record<string, string | number | boolean>,
): RoomTimelineEvent {
  return { id: deps.host.newId('evt'), roomId, at, kind: 'compaction', memberId: member.id, summary, details };
}
