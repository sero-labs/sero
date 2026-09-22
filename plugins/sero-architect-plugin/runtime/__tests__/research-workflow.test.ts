import { createRunJournal } from '../run-journal';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ORCHESTRATOR_INDEX_FILE, ORCHESTRATOR_REGISTRY_GLOBAL_KEY, type OrchestratorBoardLoopView, type OrchestratorRegistryEntryView } from '@sero-ai/common';
import { buildOwnerContract } from '../../shared/owner-contract';
import { createServices } from '../services';
import { observeResearchWorkflows } from '../research-workflow';
import { buildingProject, cleanupHosts, fakeHost, storeFor, T0 } from './helpers';

afterEach(async () => {
  delete (globalThis as Record<string, unknown>)[ORCHESTRATOR_REGISTRY_GLOBAL_KEY];
  await cleanupHosts();
});

it.each(['discovery', 'build'] as const)('uses a Workflow for research or review during %s and recovers its findings once', async (phase) => {
  const host = await fakeHost();
  const journal = createRunJournal({ homeDir: await host.homeDir() });
  const store = await storeFor(host);
  const record = buildingProject({ phase, charter: null, milestones: [] });
  await store.write(record);
  const action = vi.fn(async () => ({ ok: true, loopId: 'loop-research' }));
  const registry = new Map<string, OrchestratorRegistryEntryView>([['ws-1', {
    workspaceId: 'ws-1', workspacePath: record.folder, coordinator: { requestAction: action },
  }]]);
  (globalThis as Record<string, unknown>)[ORCHESTRATOR_REGISTRY_GLOBAL_KEY] = registry;
  const wake = vi.fn();
  const services = createServices({ host, store, wake, journal });
  const started = await services.research(record, { kind: 'workflow', question: 'Review the proposed persistence approach.', stoppingCondition: 'Report proven risks and evidence.' });
  await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  expect(action.mock.calls[0]).toEqual([expect.objectContaining({ kind: 'create', options: expect.objectContaining({ requestId: `${record.id}:${started.id}`, activate: false, workspace: { useManagedWorktree: false, allowDirtyWorkspaceRoot: true } }) })]);
  const reopened = await storeFor(host);
  const deps = { host, store: reopened, wake, journal };
  createServices(deps).recoverPending((await reopened.read(record.id))!);
  const runDir = path.join(record.folder, path.dirname(ORCHESTRATOR_INDEX_FILE), 'loops/loop-research/runs');
  host.jsonFiles[path.join(runDir, 'index.json')] = { runs: [{ id: 'run-1', status: 'completed' }] };
  host.jsonFiles[path.join(runDir, 'run-1.json')] = { stepAttempts: [{ stepId: 'review', outcome: { summary: 'The proposed schema preserves old records.' }, outputPath: '/reports/review.md' }] };
  const loop = { id: 'loop-research', status: 'complete', usage: { costUsd: 0.3 }, title: 'Review', updatedAt: T0 } satisfies OrchestratorBoardLoopView;
  await observeResearchWorkflows(deps, record.id, [loop]);
  await observeResearchWorkflows(deps, record.id, [loop]);
  const finished = (await reopened.read(record.id))!;
  expect(action).toHaveBeenCalledTimes(2);
  expect(finished.budget.sources.research).toBe(0.3);
  expect(finished.pendingResearch).toEqual([]);
    const page = await journal.readPage(record.id, `run-initial-${record.id}`);
    expect(page.records.reduce((total, entry) => total + (typeof entry.costUsd === 'number' ? entry.costUsd : 0), 0)).toBeCloseTo(finished.budget.sources.research);
  expect(finished.research).toHaveLength(1);
  expect(buildOwnerContract(finished, null)).toContain('The proposed schema preserves old records.');
  expect(finished.phase).toBe(phase);
  expect(finished.milestones).toEqual([]);
  expect(wake).toHaveBeenCalledTimes(1);
});

it('clears a stopped research Workflow and names it by the Workflow title', async () => {
  const host = await fakeHost();
  const store = await storeFor(host);
  const pending = { id: 'res-1', question: 'Does the suite pass?', stoppingCondition: 'a verdict', startedAt: T0, kind: 'workflow' as const, workflowId: 'loop-research' };
  const reason = 'Research Workflow loop-research is blocked. Open it to review the next action.';
  await store.write({ ...buildingProject({ phase: 'discovery', charter: null, milestones: [] }), pendingResearch: [pending], blockedReason: reason });
  const loop = { id: 'loop-research', status: 'active', usage: { costUsd: 0.1 }, title: 'Review', updatedAt: T0 } satisfies OrchestratorBoardLoopView;

  await observeResearchWorkflows({ host, store, wake: vi.fn() }, 'proj_1', [loop]);

  const resumed = (await store.read('proj_1'))!;
  expect(resumed.blockedReason).toBeNull();
  const entry = resumed.history.find((item) => item.cause === 'Workflow resumed');
  // The Workflow's own title is the best name the writer holds, so the entry
  // reads as `Review Workflow resumed` rather than the bare cause.
  expect(entry?.subject).toEqual({ kind: 'workflow', id: 'loop-research', label: 'Review' });
  expect(entry?.detail).toBe(reason);
});
