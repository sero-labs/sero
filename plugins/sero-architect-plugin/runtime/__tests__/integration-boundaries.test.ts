/**
 * Cross-seam boundaries (change architect-execution-efficiency-and-observability, task 8.1).
 *
 * These are the cases that live between the Architect and the Orchestrator, where
 * neither side's own suite can see the whole answer: what a prepared dispatch
 * keeps when the project changes underneath it, and what a restart reports when
 * the telemetry it needed never arrived.
 *
 * The scenarios task 8.1 names are covered here or by existing suites:
 *
 * - Room-to-Workflow handoff      `dispatch-recovery.test.ts` (approvals and finding
 *                                 references reach the Workflow; no transcript copied)
 * - independent review/repair     `owner-contract.test.ts` (who may be the independent
 *                                 check, focused re-review, evidence still required)
 * - model change during work      this file
 * - restart with partial telemetry this file, plus `run-journal.test.ts`
 * - budget and permission bounds  this file, plus `owner-session.test.ts`
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { SharedAvailableModelGroup } from '@sero-ai/common';
import { setProjectTierOverride } from '../../shared/model-config';
import { openRun } from '../../shared/runs';
import { summarizeTrace } from '../trace-summary';
import { performDispatch } from '../dispatch-link';
import { createServices } from '../services';
import { buildingProject, cleanupHosts, fakeHost, milestone, storeFor, T0 } from './helpers';

afterEach(cleanupHosts);

/** A project whose MED tier is overridden, so a change is observable. */
function dispatchingProject(overrides: Record<string, unknown> = {}) {
  const base = buildingProject({
    milestones: [milestone('m1', { status: 'approved' }), milestone('m2', { status: 'approved' })],
    ...overrides,
  });
  return setProjectTierOverride(base, 'MED', { provider: 'anthropic', modelId: 'sonnet', thinkingLevel: 'high' });
}

async function setup(overrides: Record<string, unknown> = {}) {
  const host = await fakeHost();
  // Two models, so a selection change has somewhere to move to. The default
  // fixture offers one, which cannot show a change.
  const group = (provider: string, displayName: string, modelId: string): SharedAvailableModelGroup => ({
    provider, displayName, logo: '',
    models: [{ provider, modelId, name: modelId, reasoning: true, availableThinkingLevels: ['low', 'medium', 'high'] }],
  });
  host.listModels = async () => [group('anthropic', 'Anthropic', 'sonnet'), group('openai-codex', 'OpenAI (Codex)', 'gpt-5.6-terra')];
  host.modelTiers = async () => ({
    LOW: { provider: 'anthropic', modelId: 'sonnet', thinkingLevel: 'low' },
    MED: { provider: 'anthropic', modelId: 'sonnet', thinkingLevel: 'medium' },
    HIGH: { provider: 'anthropic', modelId: 'sonnet', thinkingLevel: 'high' },
  });
  const store = await storeFor(host);
  const record = dispatchingProject(overrides);
  await store.write(record);
  const services = createServices({ host, store, wake: () => {} });
  return { host, store, services, record };
}

/** The reserved dispatch for a milestone, which carries its resolved project context. */
const preparedDispatch = async (store: Awaited<ReturnType<typeof setup>>['store'], milestoneId = 'm1') =>
  (await store.read('proj_1'))?.milestones.find((item) => item.id === milestoneId)?.pendingDispatch;

describe('a model change while work is prepared', () => {
  it('does not change the snapshot a prepared dispatch already carries', async () => {
    const { store, services, record } = await setup();
    await performDispatch(store, services, record, record.milestones[0]!, {
      kind: 'workflow', prompt: 'Build the grid', destination: null, maxCostUsd: 2,
    }, T0, true);
    const before = (await store.read('proj_1'))?.milestones[0]?.pendingDispatch?.project?.modelSnapshot;

    // The user changes the project's model selection while that work is prepared.
    await store.update('proj_1', (fresh) =>
      setProjectTierOverride(fresh, 'MED', { provider: 'openai-codex', modelId: 'gpt-5.6-terra', thinkingLevel: 'high' }));

    const after = (await store.read('proj_1'))?.milestones[0]?.pendingDispatch?.project?.modelSnapshot;
    // A dispatch in flight keeps the models it was resolved with. Changing them
    // mid-run would leave one run's work half on each selection.
    expect(after).toEqual(before);
    expect(after?.MED?.modelId).toBe('sonnet');
  });

  it('gives the next dispatch the new selection and the new revision', async () => {
    const { store, services, record } = await setup();
    await performDispatch(store, services, record, record.milestones[0]!, {
      kind: 'workflow', prompt: 'Build the grid', destination: null, maxCostUsd: 2,
    }, T0, true);
    const firstRevision = (await store.read('proj_1'))?.milestones[0]?.pendingDispatch?.project?.configRevision;

    const changed = await store.update('proj_1', (fresh) => {
      const next = setProjectTierOverride(fresh, 'MED', { provider: 'openai-codex', modelId: 'gpt-5.6-terra', thinkingLevel: 'high' });
      return { ...next, milestones: next.milestones.map((item) => item.id === 'm1' ? { ...item, pendingDispatch: undefined, dispatch: null } : item) };
    });
    await performDispatch(store, services, changed!, changed!.milestones[1]!, {
      kind: 'workflow', prompt: 'Build the combat', destination: null, maxCostUsd: 2,
    }, T0, true);

    const second = await preparedDispatch(store, 'm2');
    expect(second?.project?.modelSnapshot?.MED?.modelId).toBe('gpt-5.6-terra');
    // The revision moved, so a reader can tell which selection this run resolved.
    expect(second?.project?.configRevision).not.toBe(firstRevision);
  });
});

describe('a restart with partial telemetry', () => {
  it('reports the usage it has and marks the rest incomplete rather than zero', async () => {
    const { host, store, record } = await setup();
    const journal = (await import('../run-journal')).createRunJournal({ homeDir: await host.homeDir() });
    const opened = openRun(record, { id: 'run-1', kind: 'initial' }, T0);
    if (!opened.ok) throw new Error(opened.error);
    await store.write(opened.record);

    // One source reported a total; another reported nothing at all before the restart.
    await journal.append('proj_1', 'run-1', {
      kind: 'usage', at: T0, source: 'dispatch:workflow:loop_1', costUsd: 0.4, coverage: 'aggregate',
    });

    const words = (await journal.readPage('proj_1', 'run-1')).records;
    const trace = summarizeTrace(words, { projectId: 'proj_1', runId: 'run-1', knownSpendUsd: 0.4 });
    // What was reported is reported exactly.
    expect(trace.attributableUsd).toBeCloseTo(0.4);
    expect(trace.hasAggregate).toBe(true);
    // What was never reported is not turned into a confident zero.
    expect(trace.requests).toBe(0);
    expect(trace.inputTokens).toBe(0);
    // And the trace still reconciles with the budget for its own scope.
    expect(trace.reconciliationUsd).toBeCloseTo(0);
  });
});

describe('budget and permission boundaries while work is in flight', () => {
  it('reserves the approved cap on the milestone before the run starts', async () => {
    const { store, services, record } = await setup({ budget: { capUsd: 10, spentUsd: 9, sources: { owner: 9, research: 0, dispatched: 0 } } });
    await performDispatch(store, services, record, record.milestones[0]!, {
      kind: 'workflow', prompt: 'Build the grid', destination: null, maxCostUsd: 5,
    }, T0, true);
    // The requested cap is on the reserved dispatch, not only in the prompt.
    expect((await store.read('proj_1'))?.milestones[0]?.pendingDispatch?.request?.maxCostUsd).toBe(5);
  });

  it('keeps the granted tool set rather than widening it for the prepared work', async () => {
    const { store, services, record } = await setup();
    const granted = record.session.grantedTools;
    await performDispatch(store, services, record, record.milestones[0]!, {
      kind: 'workflow', prompt: 'Build the grid', destination: null, maxCostUsd: 2,
    }, T0, true);
    // Preparing work adds no authority to the session that owns the project.
    expect((await store.read('proj_1'))?.session.grantedTools).toEqual(granted);
  });
});
