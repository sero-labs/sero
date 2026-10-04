import { use, useCallback } from 'react';
import { AppContext, useWorkFeedback } from '@sero-ai/app-runtime';
import type { FeedbackSummary, WorkFeedback } from '@sero-ai/common';
import { ARCHITECT_FEEDBACK_TOPIC, feedbackByProject, ofProject, ORCHESTRATOR_APP_ID, ORCHESTRATOR_FEEDBACK_TOPIC, projectFeedback } from '../../shared/feedback';
import type { ArchitectIndexEntry } from '../../shared/types';
import type { ProjectRecord } from '../../shared/record';
import type { ArchitectActions } from './actions';

/**
 * What the project's research and its dispatched Workflows and Rooms are doing
 * now. It follows the Architect runtime and the Orchestrator runtime of the
 * project's workspace, keeps only work recorded under this project, and opens
 * no output watch. The read repeats when the record's delegated work changes.
 */
export function useProjectFeedback(record: ProjectRecord, actions: Pick<ArchitectActions, 'feedback'>): FeedbackSummary | null {
  const context = use(AppContext);
  const projectId = record.id;
  const read = useCallback(() => actions.feedback(projectId), [actions, projectId]);
  const sources = context?.appId && context.workspaceId ? [
    { appId: context.appId, workspaceId: context.workspaceId, topic: ARCHITECT_FEEDBACK_TOPIC },
    ...(record.workspaceId ? [{ appId: ORCHESTRATOR_APP_ID, workspaceId: record.workspaceId, topic: ORCHESTRATOR_FEEDBACK_TOPIC }] : []),
  ] : [];
  const signal = [
    ...record.milestones.map((milestone) => `${milestone.id}:${milestone.status}:${milestone.dispatch?.id ?? ''}`),
    ...(record.pendingResearch ?? []).map((entry) => `${entry.id}:${entry.roomId ?? entry.workflowId ?? entry.runId ?? ''}`),
  ].join('|');
  const view = useWorkFeedback(sources, read, signal);
  return projectFeedback(view.snapshots.values(), projectId, view.epoch);
}

/** Each producer working for the project, the owner included, for the Work view. */
export function useProjectWork(record: ProjectRecord, actions: Pick<ArchitectActions, 'feedback'>): { epoch: string | null; work: WorkFeedback[] } {
  const context = use(AppContext);
  const projectId = record.id;
  const read = useCallback(() => actions.feedback(projectId), [actions, projectId]);
  const sources = context?.appId && context.workspaceId ? [
    { appId: context.appId, workspaceId: context.workspaceId, topic: ARCHITECT_FEEDBACK_TOPIC },
    ...(record.workspaceId ? [{ appId: ORCHESTRATOR_APP_ID, workspaceId: record.workspaceId, topic: ORCHESTRATOR_FEEDBACK_TOPIC }] : []),
  ] : [];
  const view = useWorkFeedback(sources, read, `${record.updatedAt}`);
  return { epoch: view.epoch, work: [...view.snapshots.values()].filter(ofProject(projectId)) };
}

/**
 * The same for a list of projects: one read and one subscription per runtime,
 * and no project record is loaded. A widget and the projects list both use it.
 */
export function useProjectsFeedback(entries: readonly ArchitectIndexEntry[], actions: Pick<ArchitectActions, 'feedback'>): Map<string, FeedbackSummary> {
  const context = use(AppContext);
  const read = useCallback(() => actions.feedback(), [actions]);
  const workspaces = [...new Set(entries.flatMap((entry) => entry.workspaceId ?? []))].sort();
  const sources = context?.appId && context.workspaceId ? [
    { appId: context.appId, workspaceId: context.workspaceId, topic: ARCHITECT_FEEDBACK_TOPIC },
    ...workspaces.map((workspaceId) => ({ appId: ORCHESTRATOR_APP_ID, workspaceId, topic: ORCHESTRATOR_FEEDBACK_TOPIC })),
  ] : [];
  const signal = entries.map((entry) => `${entry.id}:${entry.activity.state}`).join('|');
  const view = useWorkFeedback(sources, read, signal);
  return feedbackByProject(view.snapshots.values(), view.epoch);
}
