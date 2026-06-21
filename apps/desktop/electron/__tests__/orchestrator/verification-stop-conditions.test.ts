// P-D — LLM-derived stop conditions (spec 05 §7). The planner can declare two
// conditions the engine wires beyond complete/no-progress/max-attempts:
//   • verification-unavailable — no sound way to verify the goal → block, don't
//     run blind.
//   • approval-required — the work meets its criteria but needs human sign-off →
//     block + notify; Resume is the approval (latches completion).

import { describe, expect, it } from 'vitest';

import { createHarness, settle, type WorkerScript } from './harness';
import { parsePlannerOutput } from '@plugins/sero-orchestrator-plugin/runtime/planner';
import type { PlannerRunner } from '@plugins/sero-orchestrator-plugin/runtime/planner';
import type { SuccessCriterion } from '@plugins/sero-orchestrator-plugin/shared/types';

const exitZero = (command: string): SuccessCriterion => ({
  id: 'works',
  description: 'it works',
  evidence: [{ kind: 'run', command }],
  decision: { kind: 'exit-zero' },
  required: true,
});

const changeWorker: WorkerScript = () => ({ response: 'done', changedFiles: ['x.ts'] });
const passVerify = (command: string) => ({ command, success: true, stdout: '', stderr: '', durationMs: 1 });

describe('P-D — verification-unavailable', () => {
  it('blocks (does not activate) when the planner declares no way to verify', async () => {
    const planner: PlannerRunner = async () => ({
      criteria: [],
      stopConditions: [{ kind: 'verification-unavailable', reason: 'no test runner here' }],
    });
    const h = createHarness({ planner });
    const id = await h.createLoop();
    await settle();

    const loop = await h.loop(id);
    expect(loop!.status).toBe('blocked');
    expect(loop!.blockedReason).toBe('verification-unavailable');
    expect(loop!.statusReason).toBe('no test runner here');
    expect(h.notifications.some((n) => n.type === 'warning')).toBe(true);
    h.cleanup();
  });

  it('refuses run_next while verification is unavailable', async () => {
    const planner: PlannerRunner = async () => ({
      criteria: [],
      stopConditions: [{ kind: 'verification-unavailable', reason: 'unverifiable' }],
    });
    const h = createHarness({ planner, runWorker: changeWorker });
    const id = await h.createLoop();
    await settle();

    const res = await h.coordinator.requestAction({ kind: 'run_next', loopId: id });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/verify/i);
    expect((await h.loop(id))!.attempts).toHaveLength(0);
    h.cleanup();
  });

  it('parses a verification-unavailable-only plan (no criteria)', () => {
    const parsed = parsePlannerOutput(
      '```json\n{"criteria":[],"stopConditions":[{"kind":"verification-unavailable","reason":"x"}]}\n```',
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.criteria).toHaveLength(0);
    expect(parsed!.stopConditions[0]).toMatchObject({ kind: 'verification-unavailable' });
  });
});

describe('P-D — approval-required (Resume = approval)', () => {
  const approvalPlanner: PlannerRunner = async () => ({
    criteria: [exitZero('node test.js')],
    stopConditions: [{ kind: 'approval-required', reason: 'deletes code' }],
  });

  it('blocks for approval when the criteria pass, then completes on resume', async () => {
    const h = createHarness({ planner: approvalPlanner, runWorker: changeWorker, verify: passVerify });
    const id = await h.createLoop();
    await settle();

    await h.coordinator.requestAction({ kind: 'run_next', loopId: id });
    const blocked = await h.loop(id);
    expect(blocked!.status).toBe('blocked');
    expect(blocked!.blockedReason).toBe('approval-required');
    expect(blocked!.attempts.at(-1)!.status).toBe('passed'); // criteria met; changes kept
    expect(h.notifications.some((n) => n.type === 'info' && /approval/i.test(n.message))).toBe(true);

    // Resume IS the approval.
    const res = await h.coordinator.requestAction({ kind: 'resume', loopId: id });
    expect(res.ok).toBe(true);
    const done = await h.loop(id);
    expect(done!.status).toBe('complete');
    expect(done!.approvalGranted).toBe(true);
    h.cleanup();
  });

  it('refuses run_next while awaiting approval', async () => {
    const h = createHarness({ planner: approvalPlanner, runWorker: changeWorker, verify: passVerify });
    const id = await h.createLoop();
    await settle();
    await h.coordinator.requestAction({ kind: 'run_next', loopId: id });

    const res = await h.coordinator.requestAction({ kind: 'run_next', loopId: id });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/approval/i);
    h.cleanup();
  });

  it('does not re-block after approval (latched)', async () => {
    const h = createHarness({ planner: approvalPlanner, runWorker: changeWorker, verify: passVerify });
    const id = await h.createLoop();
    await settle();
    await h.coordinator.requestAction({ kind: 'run_next', loopId: id });
    await h.coordinator.requestAction({ kind: 'resume', loopId: id });

    const done = await h.loop(id);
    expect(done!.status).toBe('complete');
    expect(done!.blockedReason).toBeUndefined();
    h.cleanup();
  });
});
