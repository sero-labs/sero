import { afterEach, describe, expect, it, vi } from 'vitest';
import { ORCHESTRATOR_REGISTRY_GLOBAL_KEY, type OrchestratorRegistryEntryView } from '@sero-ai/common';
import { Coordinator } from '../../../sero-orchestrator-plugin/runtime/coordinator';
import { createFakeHost } from '../../../sero-orchestrator-plugin/runtime/__tests__/fake-host';
import { oneStepPlan, planJson } from '../../../sero-orchestrator-plugin/runtime/__tests__/fixtures';
import { performDispatch, recoverDispatch } from '../dispatch-link';
import { createServices } from '../services';
import { buildingProject, cleanupHosts, fakeHost, milestone, storeFor, T0 } from './helpers';

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[ORCHESTRATOR_REGISTRY_GLOBAL_KEY];
  return cleanupHosts();
});

describe('Architect dispatch recovery through the Orchestrator registry', () => {
  it.each(['before-create', 'during-planning', 'before-link'] as const)('recovers %s using the saved request without a duplicate workflow', async (point) => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const record = buildingProject({ brief: 'Approved output uses record_count and a numeric total_amount.', milestones: [milestone('m1', { status: 'approved' })] });
    await store.write(record);
    const orchestrator = createFakeHost();
    let coordinator = new Coordinator(orchestrator);
    const registry = new Map<string, OrchestratorRegistryEntryView>([['ws-1', {
      workspaceId: 'ws-1', workspacePath: record.folder,
      coordinator: { requestAction: (action) => coordinator.requestAction(action) },
    }]]);
    (globalThis as Record<string, unknown>)[ORCHESTRATOR_REGISTRY_GLOBAL_KEY] = registry;
    const services = createServices({ host, store, wake: () => {} });
    const dispatch = services.dispatch;
    if (point === 'before-create') services.dispatch = async () => new Promise(() => {});
    if (point === 'during-planning') orchestrator.runStructured = async () => new Promise(() => {});
    if (point === 'before-link') {
      orchestrator.modelResponses.push({ response: planJson(oneStepPlan()) });
      services.dispatch = async (...args) => { await dispatch(...args); return new Promise(() => {}); };
    }
    await performDispatch(store, services, record, record.milestones[0], {
      kind: 'workflow', prompt: 'Build the grid', destination: null, maxCostUsd: 2,
    }, T0, true);
    if (point !== 'before-create') await vi.waitFor(() => expect(orchestrator.state.loops[0]?.creation?.[point === 'before-link' ? 'complete' : 'attempts']).toBe(point === 'before-link' ? true : 1));
    const pendingPrompt = (await store.read(record.id))?.milestones[0].pendingDispatch?.request?.prompt;
    expect(pendingPrompt).toContain(record.brief);
    await store.update(record.id, (fresh) => ({ ...fresh, brief: 'A later draft must not replace the reserved dispatch.' }));
    const savedId = orchestrator.state.loops[0]?.id;
    const restarted = createFakeHost({ initialState: structuredClone(orchestrator.state) });
    restarted.modelResponses.push({ response: planJson(oneStepPlan()) });
    coordinator = new Coordinator(restarted);
    const reopened = await storeFor(host);
    const recovery = createServices({ host, store: reopened, wake: () => {} });
    const saved = (await reopened.read(record.id))!;
    await Promise.all([recoverDispatch(reopened, recovery, saved), recoverDispatch(reopened, recovery, saved)]);
    const linked = (await reopened.read(record.id))!.milestones[0];
    expect(linked.pendingDispatch).toBeUndefined();
    expect(linked.dispatch?.id).toBe(savedId ?? restarted.state.loops[0].id);
    // The run the work was dispatched under stays on the dispatch, so late usage
    // is charged to it after the run closes.
    expect(saved.milestones[0].pendingDispatch?.project?.runId).toBeTruthy();
    expect(linked.dispatch?.runId).toBe(saved.milestones[0].pendingDispatch?.project?.runId);
    // The dispatch entry names the milestone and records the Workflow it went to.
    const dispatchEntry = (await reopened.read(record.id))!.history.filter((entry) => entry.cause === 'sent to its Workflow').at(-1);
    expect(dispatchEntry?.subject).toEqual({ kind: 'workflow', id: linked.dispatch?.id, label: 'Milestone m1' });
    expect(restarted.state.loops).toHaveLength(1);
    expect(restarted.state.loops[0].prompt).toBe(pendingPrompt);
    await vi.waitFor(() => expect(restarted.state.loops[0].status).toBe('active'));
    if (point === 'before-link') expect(restarted.modelCalls).toHaveLength(0);
  });

  it('gives the delegate the user approvals, and only the approvals', async () => {
    const host = await fakeHost();
    const store = await storeFor(host);
    const decision = (id: string, question: string, answer: { optionId: string; note: string } | null) => ({
      id, question,
      options: [{ id: 'hex', label: 'Hex', consequence: 'harder' }, { id: 'square', label: 'Square', consequence: 'simpler' }],
      recommendation: 'hex', reason: 'the charter is silent', dependsOn: [], raisedAt: T0, proposal: null,
      answer: answer ? { ...answer, answeredAt: T0 } : null,
    });
    const record = buildingProject({
      brief: 'A hex grid roguelike.',
      milestones: [milestone('m1', { status: 'approved' })],
      decisions: [
        decision('dec_answered', 'Hex or square grid?', { optionId: 'hex', note: 'Match the original.' }),
        decision('dec_open', 'Which palette?', null),
      ],
      research: [
        { id: 'res_saved', question: 'Which renderer fits?', stoppingCondition: 'enough', result: 'A long report. '.repeat(500), artifactPath: '.sero/apps/architect/research/res_saved.md', costUsd: 1, completedAt: T0 },
        { id: 'res_unsaved', question: 'Which input layout?', stoppingCondition: 'enough', result: 'Another long report. '.repeat(500), costUsd: 1, completedAt: T0 },
      ],
    });
    await store.write(record);
    const services = createServices({ host, store, wake: () => {} });
    await performDispatch(store, services, record, record.milestones[0], {
      kind: 'workflow', prompt: 'Build the grid', destination: null, maxCostUsd: 2,
    }, T0, true);

    const prompt = (await store.read(record.id))?.milestones[0].pendingDispatch?.request?.prompt ?? '';
    expect(prompt).toContain('Approved decisions (USER APPROVALS; these bind the work):');
    expect(prompt).toContain('Hex or square grid? -> the user chose "hex": Match the original.');
    // An unanswered question is not an approval, and the delegate must not
    // receive the owner's recommendation as though the user had accepted it.
    expect(prompt).not.toContain('Which palette?');
    expect(prompt).toContain('Earlier research artifacts are recommendations, not approvals');
    // Findings arrive as references. The delegate reads the report under its own
    // permissions; the handoff does not carry the report's text.
    expect(prompt).toContain('Project findings (references; read one when it is relevant):');
    expect(prompt).toContain('- Which renderer fits? - .sero/apps/architect/research/res_saved.md');
    expect(prompt).toContain('Which input layout? - the full report is not on disk');
    expect(prompt).not.toContain('A long report.');
    expect(prompt).not.toContain('Another long report.');
  });
});
