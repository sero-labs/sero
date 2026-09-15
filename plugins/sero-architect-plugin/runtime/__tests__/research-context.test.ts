import { afterEach, expect, it, vi } from 'vitest';
import { ensureResearchContext } from '../research-context';
import { createServices } from '../services';
import { buildingProject, cleanupHosts, fakeHost, storeFor, T0 } from './helpers';

afterEach(cleanupHosts);

it('retains the saved selection across restart and changed global defaults', async () => {
  const host = await fakeHost();
  const store = await storeFor(host);
  const pending = { id: 'research', question: 'q', stoppingCondition: 'answer', startedAt: T0 };
  const record = buildingProject({ pendingResearch: [pending] });
  await store.write(record);
  const first = await ensureResearchContext({ host, store }, record, pending);
  host.modelTiers = async () => ({ MED: { provider: 'unavailable', modelId: 'changed' } });
  const reopened = await storeFor(host);
  const saved = await reopened.read(record.id);
  if (!saved?.pendingResearch?.[0]) throw new Error('Research was not persisted');
  expect(await ensureResearchContext({ host, store: reopened }, saved, saved.pendingResearch[0])).toEqual(first);
});

it('refuses an unavailable project selection before starting or reserving paid research', async () => {
  const host = await fakeHost();
  const store = await storeFor(host);
  const record = buildingProject({ modelOverrides: { MED: { provider: 'missing', modelId: 'model' } } });
  await store.write(record);
  const paid = vi.spyOn(host, 'runStructured');
  const services = createServices({ host, store, wake: vi.fn() });
  await expect(services.research(record, { question: 'q', stoppingCondition: 'answer', kind: 'room' })).rejects.toThrow('unavailable');
  expect(paid).not.toHaveBeenCalled();
  expect((await store.read(record.id))?.pendingResearch ?? []).toEqual([]);
});
