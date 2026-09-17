import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { setAccountingIncomplete } from '../../shared/accounting';
import { openRun } from '../../shared/runs';
import { createRunJournal, type JournalRecord } from '../run-journal';
import { summarizeTrace } from '../trace-summary';
import { chargeRoomPlanning, recordCharge, runProjectModel } from '../project-usage';
import { buildingProject, cleanupHosts, fakeHost, milestone, storeFor, T0 } from './helpers';

afterEach(cleanupHosts);
const usage = (costUsd: number) => ({ inputTokens: 100, outputTokens: 10, totalTokens: 110, costUsd });
const params = { task: 'Inspect', parentSessionId: 'parent', workspaceId: 'ws-1' };

/** The journal lines on disk for one run, in order. */
function journalLines(homeDir: string, projectId: string, runId: string): JournalRecord[] {
  const file = path.join(homeDir, 'runs', projectId, `${runId}.journal.ndjson`);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as JournalRecord);
}

/** A project with one open run, so a charge has somewhere to be journaled. */
function projectWithRun(overrides: Parameters<typeof buildingProject>[0] = {}) {
  const opened = openRun(buildingProject(overrides), { id: 'run-1', kind: 'initial' }, T0);
  if (!opened.ok) throw new Error(opened.error);
  return opened.record;
}

describe('project model accounting', () => {
  it('persists live research spend, deduplicates cumulative reports and retains prior attempt cost', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const base = buildingProject({ pendingResearch: [{ id: 'r1', question: 'q', stoppingCondition: 'answer', startedAt: T0, chargedUsd: 0.3 }] });
    const record = { ...base, budget: { ...base.budget, spentUsd: 0.3, sources: { ...base.budget.sources, research: 0.3 } } };
    await store.write(record);
    host.runStructured = async (request) => {
      expect((await store.read(record.id))?.budget.incomplete).toBe(true);
      request.onUsage?.(usage(0.2));
      request.onUsage?.(usage(0.2));
      await vi.waitFor(async () => expect((await store.read(record.id))?.budget.sources.research).toBeCloseTo(0.5));
      return { response: 'done', usage: usage(0.25) };
    };
    const result = await runProjectModel({ host, store }, record, { kind: 'research', id: 'r1' }, params);
    expect(result.recordedCostUsd).toBeCloseTo(0.55);
    const saved = await store.read(record.id);
    expect(saved?.budget).toMatchObject({ incomplete: false, sources: { research: 0.55 } });
    expect(saved?.pendingResearch?.[0]?.chargedUsd).toBeCloseTo(0.55);
  });

  it('retains live capture spend and an incomplete marker after a lost final response', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const record = buildingProject({ pendingEvidence: [{ milestoneId: 'm1', commands: [], route: '/', startedAt: T0 }] });
    await store.write(record);
    host.runStructured = async (request) => { request.onUsage?.(usage(0.2)); throw new Error('lost response'); };
    const result = await runProjectModel({ host, store }, record, { kind: 'capture', id: 'm1' }, params);
    expect(result.error).toBe('lost response');
    expect(result.recordedCostUsd).toBe(0.2);
    expect((await store.read(record.id))?.budget).toMatchObject({ incomplete: true, sources: { dispatched: 0.2 } });
  });

  it('charges Room planning once across failed preparation and a later cumulative result', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const record = buildingProject({ milestones: [milestone('m1', { pendingDispatch: { kind: 'room', destination: null, startedAt: T0, request: { id: 'request-1', prompt: 'inspect', maxCostUsd: 2 } } })] });
    await store.write(record);
    const operation = { kind: 'dispatch' as const, id: 'm1' };
    await chargeRoomPlanning({ host, store }, record.id, operation, { costUsd: 0.2, incomplete: true });
    await chargeRoomPlanning({ host, store }, record.id, operation);
    expect(await chargeRoomPlanning({ host, store }, record.id, operation, { costUsd: 0.5 })).toBe(0.5);
    expect((await store.read(record.id))?.budget).toMatchObject({ spentUsd: 0.5, incomplete: false });
  });

  it('does not clear historical or other missing usage when one source becomes complete', () => {
    const record = buildingProject();
    const legacy = { ...record, budget: { ...record.budget, incomplete: undefined } };
    const pending = setAccountingIncomplete(legacy, 'owner:one', true);
    expect(setAccountingIncomplete(pending, 'owner:one', false).budget).toMatchObject({ incomplete: true, incompleteSources: ['historical'] });
  });

  it('preserves record identity when the accounting marker is unchanged', () => {
    const record = buildingProject();
    const pending = { ...record, budget: { ...record.budget, incomplete: true, incompleteSources: ['workflow:one'] } };
    expect(setAccountingIncomplete(pending, 'workflow:one', true)).toBe(pending);
  });
});

describe('the trace records the same deltas the budget charges', () => {
  it('journals the charged delta, not the cumulative report', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const homeDir = await host.homeDir();
    const journal = createRunJournal({ homeDir });
    const record = projectWithRun({ pendingResearch: [{ id: 'r1', question: 'q', stoppingCondition: 'answer', startedAt: T0, chargedUsd: 0 }] });
    await store.write(record);

    host.runStructured = async (request) => {
      request.onUsage?.(usage(0.2));
      request.onUsage?.(usage(0.2));
      await vi.waitFor(async () => expect((await store.read(record.id))?.budget.sources.research).toBeCloseTo(0.2));
      return { response: 'done', usage: usage(0.35) };
    };
    await runProjectModel({ host, store, journal }, record, { kind: 'research', id: 'r1' }, params);

    const charges = journalLines(homeDir, record.id, 'run-1').filter((line) => line.kind === 'usage');
    // Three reports, two new amounts: the repeated 0.2 and the final 0.35 are
    // deltas, so the journal sums to what was charged rather than to a total.
    const costs = charges
      .map((line) => line.costUsd)
      .filter((cost): cost is number => typeof cost === 'number');
    expect(costs).toHaveLength(2);
    expect(costs[0]).toBeCloseTo(0.2);
    expect(costs[1]).toBeCloseTo(0.15);
    const journaledTotal = costs.reduce((sum, cost) => sum + cost, 0);
    expect(journaledTotal).toBeCloseTo(0.35);
    expect((await store.read(record.id))?.budget.sources.research).toBeCloseTo(0.35);
  });

  it('reconciles the run trace with the project budget for the same scope', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const homeDir = await host.homeDir();
    const journal = createRunJournal({ homeDir });
    const record = projectWithRun({ pendingResearch: [{ id: 'r1', question: 'q', stoppingCondition: 'answer', startedAt: T0, chargedUsd: 0 }] });
    await store.write(record);

    host.runStructured = async (request) => {
      request.onUsage?.(usage(0.12));
      return { response: 'done', usage: usage(0.12) };
    };
    await runProjectModel({ host, store, journal }, record, { kind: 'research', id: 'r1' }, params);

    const saved = await store.read(record.id);
    const trace = summarizeTrace(journalLines(homeDir, record.id, 'run-1'), {
      projectId: record.id, runId: 'run-1', knownSpendUsd: saved?.budget.spentUsd ?? 0,
    });
    // The whole point of task 5.1: the two agree because they read one source.
    expect(trace.attributableUsd).toBeCloseTo(0.12);
    expect(trace.reconciliationUsd).toBeCloseTo(0);
    expect(trace.hasAggregate).toBe(false);
  });

  it('writes nothing when no run is open, rather than inventing one', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const homeDir = await host.homeDir();
    const journal = createRunJournal({ homeDir });
    const record = buildingProject({ pendingResearch: [{ id: 'r1', question: 'q', stoppingCondition: 'answer', startedAt: T0, chargedUsd: 0 }] });
    await store.write(record);

    host.runStructured = async () => ({ response: 'done', usage: usage(0.2) });
    await runProjectModel({ host, store, journal }, record, { kind: 'research', id: 'r1' }, params);

    // The budget still moves; the trace has nowhere to attribute it yet.
    expect((await store.read(record.id))?.budget.sources.research).toBeCloseTo(0.2);
    expect(journalLines(homeDir, record.id, 'run-1')).toEqual([]);
  });

  it('charges late delegated usage to the run it was dispatched under, not the run open now', async () => {
    const host = await fakeHost();
    const homeDir = await host.homeDir();
    const journal = createRunJournal({ homeDir });
    // The initial run has closed and a maintenance run is open: without the
    // dispatch-time identity this delta would land on the wrong objective.
    const later = openRun(buildingProject(), { id: 'run-maint', kind: 'maintenance' }, T0);
    if (!later.ok) throw new Error(later.error);
    await recordCharge({ host, journal }, later.record, 'dispatch:workflow:w1', 0.4, 'aggregate', 'run-initial');
    expect(journalLines(homeDir, later.record.id, 'run-initial')).toMatchObject([{ kind: 'usage', costUsd: 0.4, source: 'dispatch:workflow:w1' }]);
    expect(journalLines(homeDir, later.record.id, 'run-maint')).toEqual([]);
  });
});
