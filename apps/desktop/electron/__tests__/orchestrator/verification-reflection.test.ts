// The reflective revision layer (the redefined P-E). An independent read-only
// critic assesses a loop's health AFTER the fact — advisory only: it stores a
// verdict + notifies, but never changes the plan or control state. Auto-fires on
// blocked (non-approval) / stopped transitions (push), and on the on-demand
// cross-loop health check.

import { describe, expect, it } from 'vitest';

import { createHarness, settle, type WorkerScript } from './harness';
import { parseReflection } from '@plugins/sero-orchestrator-plugin/runtime/reflection';
import type { Reflector } from '@plugins/sero-orchestrator-plugin/runtime/reflection';
import type { PlannerRunner } from '@plugins/sero-orchestrator-plugin/runtime/planner';
import type { SuccessCriterion } from '@plugins/sero-orchestrator-plugin/shared/types';

const exitZero = (command: string): SuccessCriterion => ({
  id: 'works',
  description: 'it works',
  evidence: [{ kind: 'run', command }],
  decision: { kind: 'exit-zero' },
  required: true,
});

function planner(stopConditions: { kind: 'approval-required'; reason?: string }[] = []): PlannerRunner {
  return async () => ({ criteria: [exitZero('node test.js')], stopConditions });
}

const changeWorker: WorkerScript = () => ({ response: 'done', changedFiles: ['x.ts'] });
const pass = (command: string) => ({ command, success: true, stdout: '', stderr: '', durationMs: 1 });
const fail = (command: string) => ({ command, success: false, stdout: '', stderr: 'boom', durationMs: 1 });

const reflector: Reflector = async (loop, trigger) => ({
  verdict: 'stuck',
  summary: `stuck on ${loop.title}`,
  suggestion: 'clarify the goal',
});

describe('reflective layer — auto-reflection', () => {
  it('reflects when a loop stops (advisory: plan + status unchanged)', async () => {
    const h = createHarness({ planner: planner(), reflector, runWorker: changeWorker, verify: fail });
    const id = await h.createLoop({ stopRule: { maxAttempts: 1 } });
    await settle();
    await h.coordinator.requestAction({ kind: 'run_next', loopId: id });
    await settle();

    const loop = await h.loop(id);
    expect(loop!.status).toBe('stopped'); // advisory: reflection did not change the outcome
    expect(loop!.verificationPlan).toBeDefined(); // advisory: plan untouched
    expect(loop!.reflection).toBeDefined();
    expect(loop!.reflection!.verdict).toBe('stuck');
    expect(loop!.reflection!.trigger).toBe('stopped');
    expect(loop!.reflection!.suggestion).toBe('clarify the goal');
    expect(h.notifications.some((n) => n.type === 'info' && /reflection/i.test(n.message))).toBe(true);
    h.cleanup();
  });

  it('does not reflect on an approval-required block (it is not a problem)', async () => {
    const h = createHarness({
      planner: planner([{ kind: 'approval-required', reason: 'sign off' }]),
      reflector,
      runWorker: changeWorker,
      verify: pass,
    });
    const id = await h.createLoop();
    await settle();
    await h.coordinator.requestAction({ kind: 'run_next', loopId: id });
    await settle();

    const loop = await h.loop(id);
    expect(loop!.blockedReason).toBe('approval-required');
    expect(loop!.reflection).toBeUndefined();
    h.cleanup();
  });

  it('does not reflect on a clean completion', async () => {
    const h = createHarness({ planner: planner(), reflector, runWorker: changeWorker, verify: pass });
    const id = await h.createLoop();
    await settle();
    await h.coordinator.requestAction({ kind: 'run_next', loopId: id });
    await settle();

    const loop = await h.loop(id);
    expect(loop!.status).toBe('complete');
    expect(loop!.reflection).toBeUndefined();
    h.cleanup();
  });

  it('does not reflect when no reflector is configured', async () => {
    const h = createHarness({ planner: planner(), runWorker: changeWorker, verify: fail });
    const id = await h.createLoop({ stopRule: { maxAttempts: 1 } });
    await settle();
    await h.coordinator.requestAction({ kind: 'run_next', loopId: id });
    await settle();

    expect((await h.loop(id))!.reflection).toBeUndefined();
    h.cleanup();
  });
});

describe('reflective layer — health check', () => {
  it('reflects on every in-flight loop and returns a report', async () => {
    const h = createHarness({ planner: planner(), reflector });
    const a = await h.createLoop({ title: 'Alpha' });
    const b = await h.createLoop({ title: 'Beta' });
    await settle();

    const res = await h.coordinator.requestAction({ kind: 'health' });
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Alpha');
    expect(res.message).toContain('Beta');
    expect(res.message).toMatch(/stuck/);

    expect((await h.loop(a))!.reflection!.trigger).toBe('health-check');
    expect((await h.loop(b))!.reflection!.trigger).toBe('health-check');
    h.cleanup();
  });

  it('reports nothing to check when there are no in-flight goals', async () => {
    const h = createHarness({ planner: planner(), reflector });
    const res = await h.coordinator.requestAction({ kind: 'health' });
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/no in-flight goals/i);
    h.cleanup();
  });
});

describe('reflective layer — parseReflection', () => {
  const fenced = (obj: unknown) => `Thinking…\n\`\`\`json\n${JSON.stringify(obj)}\n\`\`\``;

  it('parses a well-formed verdict', () => {
    const parsed = parseReflection(fenced({ verdict: 'plan-mismatch', summary: 'the check is wrong', suggestion: 're-derive' }));
    expect(parsed).toMatchObject({ verdict: 'plan-mismatch', summary: 'the check is wrong', suggestion: 're-derive' });
  });

  it('rejects an unknown verdict or a missing summary', () => {
    expect(parseReflection(fenced({ verdict: 'magic', summary: 'x' }))).toBeNull();
    expect(parseReflection(fenced({ verdict: 'healthy' }))).toBeNull();
    expect(parseReflection('no json here')).toBeNull();
  });
});
