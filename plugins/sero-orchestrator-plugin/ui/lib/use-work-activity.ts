/**
 * What this workspace's Workflows and Rooms are doing now, for list rows.
 *
 * A row reads bounded metadata only: who works and what call is open. It opens
 * no output watch and loads no Room or Workflow record, so a list of many rows
 * costs one subscription and one read.
 */

import { use, useCallback } from 'react';
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

/** `signal` is the list's own identity and statuses, so a re-read follows a record change. */
export function useWorkActivity(signal: string): Map<string, FeedbackSummary> {
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
  return feedbackByWork(view.snapshots.values(), view.epoch);
}
