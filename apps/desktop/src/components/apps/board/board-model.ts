/**
 * Agent Board model — pure mapping from watched per-workspace state to the four
 * board columns (Backlog · Active · Needs Attention · Finished). No IO, no
 * heuristics: every card and column membership is derived from durable state
 * (docs/features/agent-board/plan.md §4).
 */

import type {
  AppRuntimeIssueSummary,
  AppRuntimePullRequestSummary,
  OrchestratorBoardLoopView,
  OrchestratorBoardRoomView,
} from '@sero-ai/common';
import type { BoardColumnId, WorkspaceBoardSlice } from '@/types/board';

export interface BoardWorkspace {
  id: string;
  name: string;
  path: string;
}

export interface BoardSession {
  sessionId: string;
  workspaceId: string;
  title: string;
  streaming: boolean;
}

export interface BoardLoopCard {
  kind: 'loop';
  key: string;
  workspaceId: string;
  workspaceName: string;
  loop: OrchestratorBoardLoopView;
  /** Issue numbers this loop's PRs close — rendered as #N chips. */
  issueNumbers: number[];
  /** Backlog cards only: why the work is parked and when it fires. */
  queuedReason?: 'draft' | 'scheduled' | 'snoozed';
  queuedAt?: string;
}

export interface BoardIssueCard {
  kind: 'issue';
  key: string;
  workspaceId: string;
  workspaceName: string;
  issue: AppRuntimeIssueSummary;
}

/**
 * A Room on the board. Rooms are the Orchestrator's other mode — a team on one
 * problem — so they share the columns rather than getting a board of their own,
 * and the card's only action is to open the Room. Room controls stay in the
 * Room: two places to pause the same team is one place too many.
 */
export interface BoardRoomCard {
  kind: 'room';
  key: string;
  workspaceId: string;
  workspaceName: string;
  room: OrchestratorBoardRoomView;
}

export interface BoardSessionCard {
  kind: 'session';
  key: string;
  workspaceId: string;
  workspaceName: string;
  sessionId: string;
  title: string;
}

export type BoardCard = BoardLoopCard | BoardIssueCard | BoardSessionCard | BoardRoomCard;

export type BoardColumns = Record<BoardColumnId, BoardCard[]>;

/** Finished stays bounded — most recent first. */
const FINISHED_CARD_CAP = 30;

const CLOSING_KEYWORD_RE = /(?:clos(?:e|es|ed)|fix(?:es|ed)?|resolv(?:e|es|ed))\s+#(\d+)/gi;

/** Issue numbers a PR body claims to close (the `Closes #N` convention). */
export function extractClosedIssueNumbers(body: string | undefined): number[] {
  if (!body) return [];
  const numbers = new Set<number>();
  for (const match of body.matchAll(CLOSING_KEYWORD_RE)) numbers.add(Number(match[1]));
  return [...numbers];
}

/**
 * Unclaimed = mechanically checkable only (the spec-15 claim filter): not
 * assigned and no open PR referencing it. Claim comments need an extra API
 * call, so a claimed-by-comment issue disappears once its PR opens.
 */
export function isUnclaimedIssue(
  issue: AppRuntimeIssueSummary,
  openPrs: AppRuntimePullRequestSummary[],
): boolean {
  if (issue.assignees.length > 0) return false;
  const closedIssueNumbers = new Set(
    openPrs.flatMap((pullRequest) => extractClosedIssueNumbers(pullRequest.body)),
  );
  return !closedIssueNumbers.has(issue.number);
}

/** The soonest upcoming fire across a loop's schedules (paused/exhausted excluded). */
function nextScheduledFire(loop: OrchestratorBoardLoopView): string | undefined {
  let nextFire: string | undefined;
  for (const schedule of loop.schedules ?? []) {
    if (!schedule.paused && !schedule.exhausted && schedule.nextFireAt
      && (!nextFire || schedule.nextFireAt < nextFire)) {
      nextFire = schedule.nextFireAt;
    }
  }
  return nextFire;
}

/** Which column a loop belongs to. Null = not shown (disabled loops). */
export function loopColumn(loop: OrchestratorBoardLoopView, nowMs: number): BoardColumnId | null {
  if (loop.status === 'disabled') return null;
  if (loop.attention || loop.status === 'blocked') return 'attention';
  if (loop.status === 'draft') return 'backlog';
  if (loop.status === 'complete') return 'done';
  // status 'active'
  if (loop.progress?.running) return 'active';
  if (loop.snoozedUntil && Date.parse(loop.snoozedUntil) > nowMs) return 'backlog';
  if (nextScheduledFire(loop)) return 'backlog';
  return 'active';
}

/**
 * Which column a Room belongs to. A Room the user must answer outranks whatever
 * else it is doing, exactly as a blocked loop does.
 */
export function roomColumn(room: OrchestratorBoardRoomView): BoardColumnId {
  if (room.attentionCount > 0 || room.status === 'paused') return 'attention';
  if (room.status === 'draft' || room.status === 'ready') return 'backlog';
  if (room.status === 'completed' || room.status === 'failed' || room.status === 'cancelled') return 'done';
  return 'active';
}

function toLoopCard(
  loop: OrchestratorBoardLoopView,
  workspace: BoardWorkspace,
  openPrs: AppRuntimePullRequestSummary[],
  nowMs: number,
): BoardLoopCard {
  const prNumbers = new Set((loop.pullRequests ?? []).map((pr) => pr.number));
  const issueNumbers = openPrs.flatMap((pullRequest) =>
    prNumbers.has(pullRequest.number) ? extractClosedIssueNumbers(pullRequest.body) : [],
  );
  const card: BoardLoopCard = {
    kind: 'loop',
    key: `${workspace.id}:loop:${loop.id}`,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    loop,
    issueNumbers: [...new Set(issueNumbers)],
  };
  if (loop.status === 'draft') {
    card.queuedReason = 'draft';
  } else if (loop.snoozedUntil && Date.parse(loop.snoozedUntil) > nowMs) {
    card.queuedReason = 'snoozed';
    card.queuedAt = loop.snoozedUntil;
  } else {
    const fire = nextScheduledFire(loop);
    if (fire) {
      card.queuedReason = 'scheduled';
      card.queuedAt = fire;
    }
  }
  return card;
}

function updatedAtOf(card: BoardCard): number {
  switch (card.kind) {
    case 'loop':
      return Date.parse(card.loop.updatedAt) || 0;
    case 'issue':
      return Date.parse(card.issue.updatedAt) || 0;
    case 'room':
      return Date.parse(card.room.updatedAt) || 0;
    default:
      return Number.MAX_SAFE_INTEGER; // live sessions float to the top
  }
}

function byUpdatedAtDesc(a: BoardCard, b: BoardCard): number {
  return updatedAtOf(b) - updatedAtOf(a);
}

/** Backlog: what fires soonest first, then drafts, then issues by recency. */
function backlogOrder(card: BoardCard): number {
  if (card.kind === 'loop') {
    if (card.queuedAt) return Date.parse(card.queuedAt) || 0;
    return Number.MAX_SAFE_INTEGER - 1; // drafts after timed work
  }
  return Number.MAX_SAFE_INTEGER; // issues last, sorted among themselves below
}

/**
 * Builds the four columns from every workspace's slices plus the live session
 * pool. Pure — recomputed on watched-file change and agent events, never on a
 * timer (`nowMs` is passed in for testability).
 */
export function buildBoardColumns(
  workspaces: BoardWorkspace[],
  slices: Record<string, WorkspaceBoardSlice | undefined>,
  sessions: BoardSession[],
  nowMs: number,
): BoardColumns {
  const columns: BoardColumns = { backlog: [], active: [], attention: [], done: [] };
  const workspaceById = new Map(workspaces.map((ws) => [ws.id, ws]));

  for (const workspace of workspaces) {
    const slice = slices[workspace.id];
    if (!slice) continue;

    // Issues already worked by a loop render as chips on that loop's card, not
    // as duplicate backlog cards.
    const claimed = new Set<number>();

    for (const loop of slice.index?.loops ?? []) {
      const column = loopColumn(loop, nowMs);
      if (!column) continue;
      const card = toLoopCard(loop, workspace, slice.openPrs, nowMs);
      for (const n of card.issueNumbers) claimed.add(n);
      columns[column].push(card);
    }

    for (const room of slice.rooms?.rooms ?? []) {
      columns[roomColumn(room)].push({
        kind: 'room',
        key: `${workspace.id}:room:${room.id}`,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        room,
      });
    }

    for (const issue of slice.issues) {
      if (!isUnclaimedIssue(issue, slice.openPrs)) continue;
      if (claimed.has(issue.number)) continue;
      columns.backlog.push({
        kind: 'issue',
        key: `${workspace.id}:issue:${issue.number}`,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        issue,
      });
    }
  }

  for (const session of sessions) {
    if (!session.streaming) continue;
    const workspace = workspaceById.get(session.workspaceId);
    columns.active.push({
      kind: 'session',
      key: `${session.workspaceId}:session:${session.sessionId}`,
      workspaceId: session.workspaceId,
      workspaceName: workspace?.name ?? session.workspaceId,
      sessionId: session.sessionId,
      title: session.title,
    });
  }

  columns.attention.sort(byUpdatedAtDesc);
  columns.active.sort(byUpdatedAtDesc);
  columns.backlog.sort((a, b) => {
    const order = backlogOrder(a) - backlogOrder(b);
    return order !== 0 ? order : byUpdatedAtDesc(a, b);
  });
  columns.done.sort(byUpdatedAtDesc);
  columns.done = columns.done.slice(0, FINISHED_CARD_CAP);

  return columns;
}

// ── Formatting helpers (shared by the card components) ──────

/** 12345 → "12.3k", 999 → "999". */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

/** 0.4218 → "$0.42"; sub-cent → "$0.004". */
export function formatCost(costUsd: number): string {
  if (costUsd >= 0.01) return `$${costUsd.toFixed(2)}`;
  return `$${costUsd.toFixed(3)}`;
}

/** Compact relative age: "12s", "4m", "3h", "2d". */
export function formatAge(iso: string | undefined, nowMs: number): string {
  if (!iso) return '';
  const deltaMs = nowMs - Date.parse(iso);
  if (!Number.isFinite(deltaMs) || deltaMs < 0) return '';
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Compact time-until: "in 5m", "in 3h", "in 2d"; past → "due". */
export function formatUntil(iso: string | undefined, nowMs: number): string {
  if (!iso) return '';
  const deltaMs = Date.parse(iso) - nowMs;
  if (!Number.isFinite(deltaMs)) return '';
  if (deltaMs <= 0) return 'due';
  const minutes = Math.ceil(deltaMs / 60_000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}
