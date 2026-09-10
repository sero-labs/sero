import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAccountingIncomplete } from '../../shared/accounting';
import { chargeRoomPlanning, runProjectModel } from '../project-usage';
import { buildingProject, cleanupHosts, fakeHost, milestone, storeFor, T0 } from './helpers';

afterEach(cleanupHosts);
const usage = (costUsd: number) => ({ inputTokens: 100, outputTokens: 10, totalTokens: 110, costUsd });
const params = { task: 'Inspect', parentSessionId: 'parent', workspaceId: 'ws-1' };

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
});
