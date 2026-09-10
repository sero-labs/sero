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
  const store = await storeFor(host);
  const record = buildingProject({ phase, charter: null, milestones: [] });
  await store.write(record);
  const action = vi.fn(async () => ({ ok: true, loopId: 'loop-research' }));
  const registry = new Map<string, OrchestratorRegistryEntryView>([['ws-1', {
    workspaceId: 'ws-1', workspacePath: record.folder, coordinator: { requestAction: action },
  }]]);
  (globalThis as Record<string, unknown>)[ORCHESTRATOR_REGISTRY_GLOBAL_KEY] = registry;
  const wake = vi.fn();
  const services = createServices({ host, store, wake });
  const started = await services.research(record, { kind: 'workflow', question: 'Review the proposed persistence approach.', stoppingCondition: 'Report proven risks and evidence.' });
  await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  expect(action.mock.calls[0]).toEqual([expect.objectContaining({ kind: 'create', options: expect.objectContaining({ requestId: `${record.id}:${started.id}`, activate: false, workspace: { useManagedWorktree: false, allowDirtyWorkspaceRoot: true } }) })]);
  const reopened = await storeFor(host);
  const deps = { host, store: reopened, wake };
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
  expect(finished.research).toHaveLength(1);
  expect(buildOwnerContract(finished, null)).toContain('The proposed schema preserves old records.');
  expect(finished.phase).toBe(phase);
  expect(finished.milestones).toEqual([]);
  expect(wake).toHaveBeenCalledTimes(1);
});
