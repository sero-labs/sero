/**
 * One rule for "this needs the user", shared by the app that owns the work and
 * by any surface that only watches its index.
 *
 * The Orchestrator states it in its lists, the workspace tree states it as one
 * icon, and the Architect states it on a project row. They must agree, so the
 * decision and the sentence are made here once. A surface decides how to show
 * it; it never decides whether it is true.
 */

import { activityNextStep, isLive } from './activity-state';
import type { ArchitectProjectView } from './architect-contract';
import type { OrchestratorBoardLoopView, OrchestratorBoardRoomView } from './orchestrator-contract';

/** Work that waits on the user, or stopped and cannot go on without one. */
export interface AttentionClaim {
  state: 'waiting-for-you' | 'stopped';
  /** The one thing the user must do. */
  action: string;
  /** Why it stopped. Present for `stopped`. */
  cause?: string;
  /** What the owning app calls this situation, when it has its own words for it. */
  headline?: string;
}

/** The claim as one sentence, in the words of the shared vocabulary. */
export function attentionSentence(claim: AttentionClaim): string {
  const next = activityNextStep(claim.state, { action: claim.action, cause: claim.cause });
  if (next === null) return `${claim.action}.`;
  return claim.state === 'waiting-for-you' && claim.headline ? `${claim.headline}. ${next}` : next;
}

/** What a blocked Workflow needs from the user, named by what blocked it. */
export function loopBlockedAction(loop: OrchestratorBoardLoopView): string {
  if (loop.block?.limit === 'maxCostUsd') return 'Raise the cap';
  if (loop.pendingInput) return 'Answer the question';
  return 'Open the Workflow to clear the block';
}

/** What a Workflow that stopped to ask something needs, counted from the ask. */
export function loopWaitingAction(loop: OrchestratorBoardLoopView): string | undefined {
  const questions = loop.attention?.input?.questions.length ?? loop.pendingInput ?? 0;
  if (questions > 0) return questions === 1 ? 'Answer the question' : `Answer ${questions} questions`;
  const suggestions = loop.attention?.suggestions?.length ?? loop.pendingSuggestions ?? 0;
  if (suggestions > 0) {
    return suggestions === 1 ? 'Review 1 suggested change' : `Review ${suggestions} suggested changes`;
  }
  return undefined;
}

/**
 * Whether this Workflow needs the user, and for what.
 *
 * A finished or paused Workflow asks nothing, whatever is left on it. A run
 * that is reporting now asks nothing either, unless it stopped to ask: a
 * suggestion raised mid-run waits for the run to end.
 */
export function loopAttention(
  loop: OrchestratorBoardLoopView,
  sessionStartedAt: string,
): AttentionClaim | null {
  if (loop.status === 'complete' || loop.status === 'disabled') return null;
  if (loop.status === 'blocked') {
    return {
      state: 'stopped',
      cause: loop.block?.reason ?? 'The Workflow stopped before it finished',
      action: loopBlockedAction(loop),
    };
  }
  const asked = loopWaitingAction(loop);
  if (asked && (loop.attention?.input || loop.pendingInput)) return { state: 'waiting-for-you', action: asked };
  if (isLive(loop.liveRun, sessionStartedAt) || loop.progress?.running || loop.liveRun) return null;
  return asked ? { state: 'waiting-for-you', action: asked } : null;
}

/**
 * Whether this Room needs the user.
 *
 * `attentionCount` is written from the same payload the Room's inbox renders,
 * so a reader with only the index counts the same things the Room shows. The
 * Room's own list names who asked; a watcher can only say that someone did.
 */
export function roomAttention(room: OrchestratorBoardRoomView): AttentionClaim | null {
  if (room.status === 'failed' || room.status === 'cancelled') {
    return {
      state: 'stopped',
      cause: room.status === 'failed' ? 'The Room stopped before it finished' : 'The Room was cancelled',
      action: 'Open the Room to decide what next',
    };
  }
  if (room.status === 'completed') return null;
  if (room.attentionCount > 0) return { state: 'waiting-for-you', action: 'Open the Room to answer' };
  return null;
}

/**
 * Whether this project needs the user. The Architect has already decided this
 * and written both the state and the action, so this only reads them.
 */
export function projectAttention(project: ArchitectProjectView): AttentionClaim | null {
  // The index is a file on disk, and a reader sees it before its writer is
  // upgraded. One written before this contract carries no activity at all.
  if (!project.activity) return null;
  const { state, action, headline } = project.activity;
  if (!action) return null;
  if (state === 'stopped') return { state: 'stopped', cause: headline, action, headline };
  if (state === 'waiting-for-you') return { state: 'waiting-for-you', action, headline };
  return null;
}
