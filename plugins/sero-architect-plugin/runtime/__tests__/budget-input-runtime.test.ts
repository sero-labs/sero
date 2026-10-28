import { afterEach, expect, it } from 'vitest';
import { ArchitectRuntime } from '../index';
import { buildingProject, cleanupHosts, fakeHost, storeFor, T0 } from './helpers';

afterEach(cleanupHosts);

it('keeps capped replies and every answer across restart, then processes them once after sufficient budget', async () => {
  const host = await fakeHost();
  const store = await storeFor(host);
  const record = buildingProject({ milestones: [], budget: { ...buildingProject().budget, capUsd: 1, spentUsd: 3 },
    decisions: Array.from({ length: 5 }, (_, index) => ({ id: `decision-${index}`, question: `Question ${index}`, options: [{ id: 'yes', label: 'Yes', consequence: 'Continue' }], recommendation: 'yes', reason: 'Scope', dependsOn: [], raisedAt: T0, proposal: null, answer: null })),
  });
  await store.write(record);
  let runtime = new ArchitectRuntime(host, {});
  try {
    await runtime.start();
    expect((await runtime.projects!.directive(record.id, 'Keep the saved request.')).ok).toBe(true);
    for (const decision of record.decisions) expect((await runtime.projects!.answer(record.id, decision.id, 'yes')).ok).toBe(true);
    await runtime.scheduler!.idle(record.id);
    expect(host.sessions.prompts).toHaveLength(0);
    await runtime.dispose();
    runtime = new ArchitectRuntime(host, {});
    await runtime.start();
    await runtime.scheduler!.idle(record.id);
    expect(host.sessions.prompts).toHaveLength(0);
    await runtime.projects!.raiseCap(record.id, 2);
    await runtime.scheduler!.idle(record.id);
    expect(host.sessions.prompts).toHaveLength(0);
    const saved = (await runtime.records()!.read(record.id))!;
    expect(saved.directives[0].reply).toBeNull();
    expect(saved.decisions.every((decision) => decision.answer?.pendingOwner)).toBe(true);
    host.sessions.onTurn = async () => {
      const caller = { sessionPath: host.sessions.sessionPath, cwd: record.folder };
      await runtime.owner!.execute(caller, { action: 'reply', projectId: record.id, directiveId: saved.directives[0].id, text: 'Processed the saved request.' });
      await runtime.owner!.execute(caller, { action: 'sleep', projectId: record.id });
    };
    await runtime.projects!.raiseCap(record.id, 5);
    await runtime.scheduler!.idle(record.id);
    expect(host.sessions.prompts).toHaveLength(1);
    expect(host.sessions.prompts[0].content).toContain('Keep the saved request.');
    for (const decision of record.decisions) expect(host.sessions.prompts[0].content).toContain(decision.question);
    expect((await runtime.records()!.read(record.id))!.decisions.every((decision) => decision.answer?.pendingOwner === false)).toBe(true);
    await runtime.dispose();
    runtime = new ArchitectRuntime(host, {});
    await runtime.start();
    await runtime.scheduler!.idle(record.id);
    expect(host.sessions.prompts).toHaveLength(1);
  } finally { await runtime.dispose(); }
});
