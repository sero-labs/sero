import { describe, expect, it, vi } from 'vitest';
import type { ModelRunResult } from '../host';
import { Coordinator } from '../coordinator';
import { createFakeHost } from './fake-host';
import { oneStepPlan, planJson } from './fixtures';

const request = { kind: 'create' as const, prompt: 'Build the grid', options: { requestId: 'dispatch-1' } };

describe('workflow creation recovery', () => {
  it('saves before planning, resumes the same draft after restart and reuses a completed response', async () => {
    const host = createFakeHost();
    host.runStructured = async () => new Promise<ModelRunResult>(() => {});
    void new Coordinator(host).requestAction(request);
    await vi.waitFor(() => expect(host.state.loops[0]?.creation?.attempts).toBe(1));
    const savedId = host.state.loops[0].id;
    const restarted = createFakeHost({ initialState: structuredClone(host.state) });
    restarted.modelResponses.push({ response: planJson(oneStepPlan()) });
    const coordinator = new Coordinator(restarted);
    const recovered = await coordinator.requestAction(request);
    expect(recovered).toMatchObject({ ok: true, loopId: savedId });
    expect(restarted.state.loops).toHaveLength(1);
    expect(restarted.state.loops[0].plan.steps).toHaveLength(1);
    const calls = restarted.modelCalls.length;
    expect(await new Coordinator(restarted).requestAction(request)).toMatchObject({ ok: true, loopId: savedId });
    expect(restarted.modelCalls).toHaveLength(calls);
  });

  it('coalesces concurrent creates and retains the attempt limit across restarts', async () => {
    const host = createFakeHost();
    host.runStructured = vi.fn(async () => new Promise<ModelRunResult>(() => {}));
    const coordinator = new Coordinator(host);
    void coordinator.requestAction(request);
    void coordinator.requestAction(request);
    await vi.waitFor(() => expect(host.runStructured).toHaveBeenCalledOnce());
    expect(host.state.loops).toHaveLength(1);
    const second = createFakeHost({ initialState: structuredClone(host.state) });
    second.runStructured = vi.fn(async () => new Promise<ModelRunResult>(() => {}));
    void new Coordinator(second).requestAction(request);
    await vi.waitFor(() => expect(second.runStructured).toHaveBeenCalledOnce());
    const third = createFakeHost({ initialState: structuredClone(second.state) });
    expect(await new Coordinator(third).requestAction(request)).toMatchObject({ ok: false, error: expect.stringContaining('interrupted twice') });
    expect(third.modelCalls).toHaveLength(0);
    expect(third.state.loops).toHaveLength(1);
  });
});
