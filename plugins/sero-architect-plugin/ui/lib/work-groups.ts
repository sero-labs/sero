// How the Work view groups what is running: the Architect's own work first,
// then each Room and Workflow the project started.

import { ARCHITECT_APP_ID, feedbackActivity, type WorkFeedback } from '@sero-ai/common';

import type { ProjectRecord } from '../../shared/record';

export interface WorkGroup {
  key: string;
  /** "Room · Build the synth". The Architect's own work has no heading link. */
  title: string;
  link: { kind: 'room' | 'workflow'; id: string; workspaceId: string } | null;
  rows: WorkFeedback[];
}

/** The name the record gave a Room or Workflow. Never read from a live title. */
function linkedTitle(record: ProjectRecord, id: string): string | null {
  const milestone = record.milestones.find((item) => item.dispatch?.id === id);
  if (milestone) return milestone.title;
  const research = [...(record.pendingResearch ?? []), ...record.research].find((entry) => entry.roomId === id || entry.workflowId === id);
  return research?.question ?? null;
}

/** Work that has not ended, grouped by the Room or Workflow it runs in. */
export function workGroups(record: ProjectRecord, work: readonly WorkFeedback[], epoch: string | null = null): WorkGroup[] {
  const groups = new Map<string, WorkGroup>();
  // The owner keeps one producer for the whole project. Between its turns it is
  // idle, which the overview already says, so it is listed only while it works.
  const resting = (item: WorkFeedback) => item.kind === 'owner-wake' && !(epoch !== null && feedbackActivity(item, epoch) === 'working');
  for (const entry of work.filter((item) => !item.terminal && !resting(item))) {
    const own = entry.scope.appId === ARCHITECT_APP_ID;
    const id = entry.scope.workId ?? '';
    const kind = entry.kind === 'room-member' ? 'room' : 'workflow';
    const key = own || !id ? 'architect' : `${kind}:${id}`;
    const group = groups.get(key) ?? {
      key,
      title: key === 'architect' ? 'Architect' : `${kind === 'room' ? 'Room' : 'Workflow'}${linkedTitle(record, id) ? ` · ${linkedTitle(record, id)}` : ''}`,
      link: key === 'architect' || !record.workspaceId ? null : { kind, id, workspaceId: record.workspaceId },
      rows: [],
    };
    group.rows.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => (a.key === 'architect' ? -1 : b.key === 'architect' ? 1 : a.title.localeCompare(b.title)));
}
