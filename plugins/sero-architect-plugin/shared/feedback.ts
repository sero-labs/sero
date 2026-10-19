// Work feedback for one project: what its owner, its research and its linked
// Workflows and Rooms are doing now. Metadata only, read by the project views.

import { ACTIVITY_STATE_WORD, ORCHESTRATOR_APP_ID, summarizeFeedback, type FeedbackSummary, type PersistentSessionLiveSnapshot, type WorkFeedback } from '@sero-ai/common';
import type { ProjectActivity } from './activity';

/** The topic the Architect runtime pushes its own feedback on. */
export const ARCHITECT_FEEDBACK_TOPIC = 'architect-feedback';
/** The topic the Orchestrator runtime of a project's workspace pushes on. */
export const ORCHESTRATOR_FEEDBACK_TOPIC = 'orchestrator-feedback';
export { ORCHESTRATOR_APP_ID };
/** The topic the owner's live turn is pushed on while a Work view watches it. */
export const ARCHITECT_OWNER_LIVE_TOPIC = 'architect-owner-live';

/** The owner's current turn. `live` is null when no owner session is open. */
export interface OwnerLiveNotice {
  projectId: string;
  live: PersistentSessionLiveSnapshot | null;
  /** Up to three tool calls of the current turn that finished, newest first. */
  recent: { toolName: string; summary: string }[];
  /** How many tool calls of the current turn have finished. */
  finished: number;
}

/**
 * Whether a snapshot belongs to the project. Matched on the project id the
 * producing runtime recorded, never on a title or a time, so work with no
 * recorded project is left out instead of guessed in.
 */
export function ofProject(projectId: string): (feedback: WorkFeedback) => boolean {
  return (feedback) => feedback.scope.projectId === projectId;
}

/** The project's concurrent work, named together. Null before anything reported. */
export function projectFeedback(snapshots: Iterable<WorkFeedback>, projectId: string, epoch: string | null): FeedbackSummary | null {
  if (!epoch) return null;
  // The owner's own turn is not delegated work: the record already says when
  // the Architect is working, and counting it here would call idle research busy.
  const mine = [...snapshots].filter(ofProject(projectId)).filter((entry) => entry.kind !== 'owner-wake');
  return mine.length > 0 ? summarizeFeedback(mine, epoch) : null;
}

/** Every project's delegated work, by project id. A snapshot with no recorded project is left out. */
export function feedbackByProject(snapshots: Iterable<WorkFeedback>, epoch: string | null): Map<string, FeedbackSummary> {
  const all = [...snapshots];
  const summaries = new Map<string, FeedbackSummary>();
  for (const projectId of new Set(all.flatMap((entry) => entry.scope.projectId ?? []))) {
    const summary = projectFeedback(all, projectId, epoch);
    if (summary) summaries.set(projectId, summary);
  }
  return summaries;
}

/**
 * A list row's saved activity, corrected by what its work reports now. The
 * index is written when a record changes, and a producer's contact changes
 * without one, so a row saved as last known reads working while its workers
 * are attached, and a paused row names the turns still finishing. No state is
 * changed otherwise: a row that needs the user, is paused or has stopped keeps
 * the state the record gave it.
 */
export function observedActivity(saved: ProjectActivity, feedback: FeedbackSummary | undefined): ProjectActivity {
  // A pause lets the turns in flight finish. The row says so until they do.
  if (saved.state === 'paused' && feedback && feedback.activeCount > 0) {
    return { ...saved, owner: feedback.activeCount === 1 ? '1 turn is still finishing' : `${feedback.activeCount} turns are still finishing` };
  }
  if (saved.state !== 'last-known' || !feedback || feedback.activeCount === 0) return saved;
  const names = feedback.current.map((entry) => entry.owner).join(', ');
  const more = feedback.activeCount - feedback.current.length;
  return {
    state: 'working',
    headline: ACTIVITY_STATE_WORD.working,
    owner: more > 0 ? `${names} and ${more} more` : names,
    ...(feedback.lastActivityAt ? { ownerAt: feedback.lastActivityAt } : {}),
  };
}
