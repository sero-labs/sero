import path from 'node:path';
import { workflowWorkspace } from './execution-location';
import { setTimeout as delay } from 'node:timers/promises';
import { getOrchestratorRegistry, requestOrchestratorAction, ORCHESTRATOR_INDEX_FILE, type OrchestratorBoardLoopView } from '@sero-ai/common';
import { block, charge, settle, unblock } from '../shared/lifecycle';
import type { PendingResearch, ProjectRecord } from '../shared/record';
import type { WakeEvent } from '../shared/wake';
import type { ArchitectHost } from './host';
import type { RecordStore } from './record-store';

interface ResearchWorkflowDeps {
  host: Pick<ArchitectHost, 'readJson' | 'now' | 'log'>;
  store: RecordStore;
  wake(projectId: string, wake: WakeEvent): void;
}

const active = new WeakMap<RecordStore, Set<string>>();
const stateDir = path.dirname(ORCHESTRATOR_INDEX_FILE);

/** Research and reviews can use a Workflow without inventing an implementation milestone. */
export async function startResearchWorkflow(deps: ResearchWorkflowDeps, record: ProjectRecord, pending: PendingResearch): Promise<void> {
  let running = active.get(deps.store);
  if (!running) { running = new Set(); active.set(deps.store, running); }
  if (running.has(pending.id)) return;
  running.add(pending.id);
  try {
    if (!record.workspaceId) throw new Error('The project has no workspace for research.');
    const deadline = Date.now() + 5000;
    while (!getOrchestratorRegistry()?.has(record.workspaceId) && Date.now() < deadline) await delay(100);
    if (!getOrchestratorRegistry()?.has(record.workspaceId)) throw new Error('The workspace Workflow runtime is not ready. Resume to retry.');
    let loopId = pending.workflowId;
    if (!loopId) {
      if (record.paused || record.blockedReason) return;
      const remaining = record.budget.capUsd === null ? 5 : record.budget.capUsd - record.budget.spentUsd;
      if (remaining <= 0) throw new Error('There is no project budget left for research.');
      const result = await requestOrchestratorAction(record.workspaceId, {
        kind: 'create',
        title: pending.question,
        prompt: `Investigate this project question in a bounded sequence of steps.\nUser idea: ${record.idea}\nQuestion: ${pending.question}\nStop when: ${pending.stoppingCondition}\nProduce findings, evidence and unresolved user decisions. Save the final research report as a local artifact and include its path in the final step summary. Do not implement the product or change its source files.`,
        options: { requestId: `${record.id}:${pending.id}`, activate: false, disableTokenLimit: true,
          limits: { maxCostUsd: Math.min(5, remaining) }, workspace: workflowWorkspace(record), delivery: { destination: 'workspace-files' } },
      });
      if (!result.ok || !result.loopId) throw new Error(result.error ?? 'The research Workflow was not created.');
      loopId = result.loopId;
      await deps.store.update(record.id, (fresh) => settle({ ...fresh,
        pendingResearch: fresh.pendingResearch?.map((entry) => entry.id === pending.id ? { ...entry, workflowId: loopId, chargedUsd: 0 } : entry),
        stateLine: 'A Workflow is investigating the project question.',
      }, deps.host.now()));
    }
    const saved = await deps.host.readJson(path.join(record.folder, stateDir, 'loops', loopId, 'loop.json')) as { status?: string } | null;
    if (!pending.workflowId || saved?.status === 'draft') {
      if (record.paused || record.blockedReason) return;
      const started = await requestOrchestratorAction(record.workspaceId, { kind: 'activate', loopId });
      if (!started.ok) throw new Error(started.error ?? 'The research Workflow could not start.');
    }
    const index = await deps.host.readJson(path.join(record.folder, ORCHESTRATOR_INDEX_FILE));
    const loops = (index as { loops?: OrchestratorBoardLoopView[] } | null)?.loops;
    if (Array.isArray(loops)) await observeResearchWorkflows(deps, record.id, loops);
  } catch (error) {
    const reason = `Research Workflow could not continue: ${error instanceof Error ? error.message : String(error)}`;
    await deps.store.update(record.id, (fresh) => {
      const held = block(fresh, deps.host.now(), reason);
      return held.ok ? { ...held.record, stateLine: reason } : fresh;
    });
  } finally { running.delete(pending.id); }
}

interface ResultAttempt { stepId: string; model?: string; outcome?: { summary: string }; outputPath?: string }

async function findings(deps: ResearchWorkflowDeps, folder: string, loopId: string): Promise<string | null> {
  const runDir = path.join(folder, stateDir, 'loops', loopId, 'runs');
  const index = await deps.host.readJson(path.join(runDir, 'index.json')) as { runs?: { id: string; status: string }[] } | null;
  const latest = index?.runs?.find((run) => run.status === 'completed');
  if (!latest) return null;
  const run = await deps.host.readJson(path.join(runDir, `${latest.id}.json`)) as { stepAttempts?: ResultAttempt[] } | null;
  const results = run?.stepAttempts?.filter((attempt) => attempt.outcome?.summary);
  return results?.length ? results.map((attempt) => `${attempt.stepId}: ${attempt.outcome?.summary}${attempt.outputPath ? `\nReport: ${attempt.outputPath}` : ''}`).join('\n\n') : null;
}

export async function observeResearchWorkflows(deps: ResearchWorkflowDeps, projectId: string, loops: OrchestratorBoardLoopView[]): Promise<void> {
  const record = await deps.store.read(projectId);
  if (!record) return;
  for (const pending of record.pendingResearch ?? []) {
    const loop = loops.find((entry) => entry.id === pending.workflowId);
    if (pending.kind !== 'workflow' || !loop) continue;
    const result = loop.status === 'complete' ? await findings(deps, record.folder, loop.id) : null;
    let completed = false;
    await deps.store.update(projectId, (fresh) => {
      const current = fresh.pendingResearch?.find((entry) => entry.id === pending.id);
      if (!current) return null;
      const costUsd = loop.usage?.costUsd ?? 0;
      let next = charge(fresh, 'research', Math.max(0, costUsd - (current.chargedUsd ?? 0)), deps.host.now());
      if (next.blockedReason?.startsWith(`Research Workflow ${loop.id} is `) && loop.status !== 'blocked') {
        const resumed = unblock(next, deps.host.now(), `Research Workflow ${loop.id} resumed`);
        if (resumed.ok) next = resumed.record;
      }
      if (result) {
        completed = true;
        return settle({ ...next, stateLine: 'Workflow findings are ready for the Architect.',
          pendingResearch: next.pendingResearch?.filter((entry) => entry.id !== pending.id),
          research: [...next.research, { id: pending.id, workflowId: loop.id, question: pending.question, stoppingCondition: pending.stoppingCondition, result, costUsd, completedAt: deps.host.now() }],
        }, deps.host.now());
      }
      next = { ...next, pendingResearch: next.pendingResearch?.map((entry) => entry.id === pending.id ? { ...entry, chargedUsd: costUsd } : entry) };
      if (loop.status === 'blocked') {
        const reason = `Research Workflow ${loop.id} is blocked. Open it to review the next action.`;
        const held = block(next, deps.host.now(), reason);
        if (held.ok) next = { ...held.record, stateLine: reason };
      }
      return next;
    });
    if (completed) deps.wake(projectId, { kind: 'quiet', at: deps.host.now(), items: [`Research Workflow ${loop.id} finished. Read research ${pending.id} and use its findings for the next project action.`] });
  }
}
