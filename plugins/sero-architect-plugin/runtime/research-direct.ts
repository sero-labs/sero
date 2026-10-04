/**
 * Direct research: one read-only researcher run through the subagent seam.
 * The owner asks a question with a stopping condition; the runtime runs it,
 * saves the finding and its report, and wakes the owner.
 */

import { modelKey, type ObservationOperationKind } from '@sero-ai/common';

import { block } from '../shared/lifecycle';
import type { PendingResearch, ProjectRecord, ResearchResult } from '../shared/record';
import { closeDeliveredObjectives } from './objective-completion';
import { runProjectModel } from './project-usage';
import { attachResearchArtifact } from './research-artifact';
import { ensureResearchContext } from './research-context';
import { researchTask } from './service-helpers';
import type { ServicesDeps } from './services';

/** The span wrapper the services share, so the research shows as one operation. */
export type SpanRunner = <T>(
  record: ProjectRecord,
  kind: ObservationOperationKind,
  suffix: string,
  work: () => Promise<T>,
) => Promise<T>;

export async function runDirectResearch(deps: ServicesDeps, span: SpanRunner, record: ProjectRecord, pending: PendingResearch): Promise<void> {
  const { host, store } = deps;
  if (!record.executionMode) {
    await store.update(record.id, (fresh) => {
      const held = block(fresh, host.now(), 'Choose Workspace or Worktree in project settings before resuming research.');
      return held.ok ? held.record : fresh;
    });
    return;
  }
  const project = await ensureResearchContext(deps, record, pending);
  const model = project.modelSnapshot?.MED;
  const result = await span(record, 'research', pending.id, () => runProjectModel(deps, record, { kind: 'research', id: pending.id }, {
    systemPrompt: 'Research the supplied project question using read-only tools. Verify facts, cite sources, and stop at the stated stopping condition. Do not modify files or perform external actions.',
    model: model ? modelKey(model.provider, model.modelId) : undefined,
    thinking: model?.thinkingLevel,
    task: researchTask(record, pending.question, pending.stoppingCondition),
    parentSessionId: `architect:${record.id}:research`,
    workspaceId: record.workspaceId ?? 'global',
    cwd: record.folder,
    timeoutMs: 15 * 60_000,
    platformTools: 'readOnly',
  }));
  const entry: ResearchResult = {
    id: pending.id,
    question: pending.question,
    stoppingCondition: pending.stoppingCondition,
    result: result.error ? `Research failed: ${result.error}` : result.response,
    costUsd: result.recordedCostUsd,
    completedAt: host.now(),
  };
  const written = await store.update(record.id, (fresh) => closeDeliveredObjectives({
    ...fresh,
    research: [...fresh.research, entry],
    pendingResearch: (fresh.pendingResearch ?? []).filter((item) => item.id !== pending.id),
  }, host.now()));
  if (!written) return;
  // The finding is already recorded, so saving the report only adds the
  // reference a later contract points at.
  await attachResearchArtifact(store, record.id, pending.id);
  deps.wake(record.id,{ kind: 'quiet', at: host.now(), items: [`research ${pending.id} finished (started ${pending.startedAt}): ${pending.question}`] });
}
