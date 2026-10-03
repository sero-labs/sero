// Work feedback for one project: what its owner, its research and its linked
// Workflows and Rooms are doing now. Metadata only, read by the project views.

import { ACTIVITY_STATE_WORD, ORCHESTRATOR_APP_ID, summarizeFeedback, type FeedbackSummary, type WorkFeedback } from '@sero-ai/common';
import type { ProjectActivity } from './activity';

/** The topic the Architect runtime pushes its own feedback on. */
export const ARCHITECT_FEEDBACK_TOPIC = 'architect-feedback';
/** The topic the Orchestrator runtime of a project's workspace pushes on. */
export const ORCHESTRATOR_FEEDBACK_TOPIC = 'orchestrator-feedback';
export { ORCHESTRATOR_APP_ID };

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
 * are attached. Nothing else is overridden: a row that needs the user, is
 * paused or has stopped keeps the state the record gave it.
 */
export function observedActivity(saved: ProjectActivity, feedback: FeedbackSummary | undefined): ProjectActivity {
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
