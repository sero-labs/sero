/**
 * What this workspace's Workflows and Rooms are doing now, for list rows.
 *
 * A row reads bounded metadata only: who works and what call is open. It opens
 * no output watch and loads no Room or Workflow record, so a list of many rows
 * costs one subscription and one read.
 */

import { createContext, use, useCallback, useMemo } from 'react';
import { AppContext, useAppTools, useWorkFeedback } from '@sero-ai/app-runtime';
import { summarizeFeedback, type FeedbackSnapshotReply, type FeedbackSummary, type WorkFeedback } from '@sero-ai/common';

export const ORCHESTRATOR_FEEDBACK_TOPIC = 'orchestrator-feedback';

/** The work under each Workflow or Room id, summarised. An id with none is absent. */
export function feedbackByWork(snapshots: Iterable<WorkFeedback>, epoch: string | null): Map<string, FeedbackSummary> {
  const grouped = new Map<string, WorkFeedback[]>();
  for (const snapshot of snapshots) {
    const workId = snapshot.scope.workId;
    if (!workId) continue;
    grouped.set(workId, [...(grouped.get(workId) ?? []), snapshot]);
  }
  const summaries = new Map<string, FeedbackSummary>();
  if (!epoch) return summaries;
  for (const [workId, entries] of grouped) summaries.set(workId, summarizeFeedback(entries, epoch));
  return summaries;
}

/** Everything one read shows: the summary per Workflow or Room, and each producer's own snapshot. */
export interface WorkView {
  byWork: Map<string, FeedbackSummary>;
  /** One step attempt's snapshot, by `scope.attemptId`. A fan-out item is its own attempt. */
  byAttempt: ReadonlyMap<string, WorkFeedback>;
  /** One Room member's snapshot, by `scope.memberId`. */
  byMember: ReadonlyMap<string, WorkFeedback>;
  /** The reader's epoch. A snapshot from another epoch proves nothing about now. */
  epoch: string | null;
}

export const NO_WORK: WorkView = { byWork: new Map(), byAttempt: new Map(), byMember: new Map(), epoch: null };

/** `signal` is the list's own identity and statuses, so a re-read follows a record change. */
export function useWorkActivity(signal: string): Map<string, FeedbackSummary> {
  return useWorkView(signal).byWork;
}

/** The same subscription as `useWorkActivity`, with the producers behind each summary. */
export function useWorkView(signal: string): WorkView {
  const context = use(AppContext);
  const { run } = useAppTools();
  const read = useCallback(async (): Promise<FeedbackSnapshotReply | null> => {
    const result = await run('rooms', { action: 'feedback' });
    return (result?.details as { feedback?: FeedbackSnapshotReply } | null)?.feedback ?? null;
  }, [run]);
  const sources = context?.appId && context.workspaceId
    ? [{ appId: context.appId, workspaceId: context.workspaceId, topic: ORCHESTRATOR_FEEDBACK_TOPIC }]
    : [];
  const view = useWorkFeedback(sources, read, signal);
  // The view is a new object only when a snapshot changed, so the page's
  // consumers re-render on a change and not on every render of the caller.
  return useMemo(() => {
    const byAttempt = new Map<string, WorkFeedback>();
    const byMember = new Map<string, WorkFeedback>();
    for (const snapshot of view.snapshots.values()) {
      if (snapshot.scope.attemptId) byAttempt.set(snapshot.scope.attemptId, snapshot);
      if (snapshot.scope.memberId) byMember.set(snapshot.scope.memberId, snapshot);
    }
    return { byWork: feedbackByWork(view.snapshots.values(), view.epoch), byAttempt, byMember, epoch: view.epoch };
  }, [view]);
}

/**
 * The page's own read, offered to the cards under it. A page reads the feedback
 * once and its steps and members take their part from it, so a card never
 * opens a subscription of its own.
 */
export const WorkViewContext = createContext<WorkView>(NO_WORK);
