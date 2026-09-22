// @vitest-environment jsdom

/**
 * A fresh project's History, written by the real writers and read through the
 * real HistoryView. Every entry the new code wrote names its subject, and no
 * entry it wrote prints a raw record id.
 */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { ProjectRecord } from '../../shared/record';
import { createOwnerActions, type OwnerServices } from '../../runtime/owner-actions';
import { createTurnOutcomes } from '../../runtime/turn-outcomes';
import { buildingProject, cleanupHosts, fakeHost, milestone, storeFor } from '../../runtime/__tests__/helpers';
import { HistoryView } from '../components/HistoryView';
import { historyLine } from '../lib/history-view';

vi.mock('@sero-ai/app-runtime', () => ({
  openSeroApp: vi.fn(async () => true),
  openSeroFile: vi.fn(async () => true),
  useAppPreferences: () => ({ values: {}, set: vi.fn() }),
}));

afterEach(cleanupHosts);

it('reads a fresh History by subject, with no raw id', async () => {
  const host = await fakeHost();
  const store = await storeFor(host);
  const services: OwnerServices = {
    research: vi.fn(async () => ({ id: 'res_1' })),
    resolveDispatchProject: vi.fn(async (record: ProjectRecord) => ({ projectId: record.id, runId: `run-initial-${record.id}` })),
    dispatch: vi.fn(async () => ({ id: 'loop_9', workspaceId: 'ws-1', baseCommit: 'base-1' })),
    evidence: vi.fn(async () => undefined),
    recoverPending: vi.fn(),
    restartResearch: vi.fn(),
    evidenceIsStale: vi.fn(async () => false),
    maintenance: vi.fn(async (record: ProjectRecord) => record),
  };
  await store.write(buildingProject({ milestones: [milestone('m1', { status: 'approved', plan: 'the plan' })] }));
  const actions = createOwnerActions({ host, store, outcomes: createTurnOutcomes(), services });
  const owner = { sessionPath: '/sessions/owner.jsonl', cwd: '/home/dan/projects/hollow' };

  // The real writers, exactly as the app calls them.
  const dispatched = await actions.execute(owner, { action: 'dispatch', projectId: 'proj_1', milestoneId: 'm1', kind: 'workflow', prompt: 'Build the grid' });
  expect(dispatched.ok).toBe(true);
  await actions.execute(owner, {
    action: 'decide', projectId: 'proj_1', question: 'Hex or square?', recommendation: 'hex', reason: 'the charter is silent',
    optionsJson: JSON.stringify([{ id: 'hex', label: 'Hex', consequence: 'harder' }, { id: 'square', label: 'Square', consequence: 'simpler' }]),
  });
  await actions.execute(owner, { action: 'milestone', projectId: 'proj_1', title: 'A new step', plan: 'do it' });

  const record = (await store.read('proj_1'))!;
  const fresh = record.history.filter((entry) => entry.subject !== undefined);
  expect(fresh.length).toBeGreaterThanOrEqual(3);

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(
    <HistoryView record={record} onBack={() => undefined} onOpenDispatch={() => undefined} onOpenEvidence={() => undefined} folds={{ opened: new Set(), toggle: () => undefined }} />,
  ));

  // Every entry the new code wrote names its subject. A decision's cause is
  // already a sentence, so it takes no label prefix.
  const named = fresh.filter((entry) => entry.subject?.kind !== 'decision');
  expect(named.length).toBeGreaterThanOrEqual(2);
  for (const entry of named) expect(historyLine(entry)).toContain(entry.subject?.label ?? '');
  for (const entry of fresh) expect(historyLine(entry)).not.toMatch(/\b(loop_[0-9a-f-]{8,}|dec_[a-z0-9]{4,})/i);
  // No raw record id appears anywhere on the page.
  expect(container.textContent ?? '').not.toMatch(/\b(loop_[0-9a-f-]{8,}|dec_[a-z0-9]{4,}|run-initial-)/i);
  // The subjects are named and linked.
  expect(container.textContent).toContain('sent to its Workflow');
  expect(container.textContent).toContain('Architect asked a question');
  expect(container.textContent).toContain('added');

  act(() => root.unmount());
  container.remove();
});
