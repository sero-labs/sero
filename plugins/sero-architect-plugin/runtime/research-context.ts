import type { OrchestratorProjectContext } from '@sero-ai/common';
import type { PendingResearch, ProjectRecord } from '../shared/record';
import { resolveProjectContext, type ModelCatalogue } from './model-resolution';
import type { RecordStore } from './record-store';

/** Persist the selection before a paid call, including recovery of older records. */
export async function ensureResearchContext(
  deps: { host: ModelCatalogue; store: RecordStore },
  record: ProjectRecord,
  pending: PendingResearch,
): Promise<OrchestratorProjectContext> {
  if (pending.project) return pending.project;
  const resolved = await resolveProjectContext(deps.host, record);
  if (!resolved.ok) throw new Error(resolved.error);
  const saved = await deps.store.update(record.id, (fresh) => ({
    ...fresh,
    pendingResearch: fresh.pendingResearch?.map((entry) => entry.id === pending.id
      ? { ...entry, project: entry.project ?? resolved.value } : entry),
  }));
  const project = saved?.pendingResearch?.find((entry) => entry.id === pending.id)?.project;
  if (!project) throw new Error('The research request is no longer pending.');
  return project;
}
