import { describe, expect, it } from 'vitest';
import { Coordinator } from '../coordinator';
import { LoopLocks } from '../locks';
import type { EngineDeps } from '../engine-types';
import type { Loop, StepAttempt, StepOutcome } from '../../shared/types';
import type { DeliveryReceipt } from '../../shared/delivery-types';
import { deliveryProblems, enforceDeliveryContract, formatDeliveryRepair, receiptRequirement } from '../delivery/delivery-contract';
import { verifyReceipt } from '../delivery/verify-receipt';
import { recordCompletion } from '../outcomes';
import { toRunSummary } from '../store';
import { outcomeNotification } from '../notify-outcome';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';
import { fakeDecider, fakeExecutor } from './engine-fakes';

const RECEIPT: DeliveryReceipt = {
  destination: 'saved-artifact',
  ref: 'reports/digest.md',
  summary: 'Saved the digest report',
  deliveredAt: '2026-01-01T00:00:10.000Z',
};

function completing(receipt?: DeliveryReceipt): StepOutcome {
  return { status: 'succeeded', summary: 'done', completion: { status: 'complete', reason: 'objective met', receipt } };
}

function seedDeliveryLoop(host: FakeHost, destination: DeliveryReceipt['destination'] = 'saved-artifact'): Loop {
  const loop = seedActiveLoop(host, oneStepPlan().plan);
  loop.delivery = { destination };
  host.state = { ...host.state, loops: [loop] };
  return loop;
}

function engine(host: FakeHost, outcomes: Record<string, StepOutcome>): Coordinator {
  const deps: EngineDeps = { executor: fakeExecutor(outcomes), decider: fakeDecider({ decision: 'wait' }), locks: new LoopLocks() };
  return new Coordinator(host, deps);
}

describe('delivery contract (pure)', () => {
  it('requires a receipt only on the final step of a destination-declaring loop', () => {
    const host = createFakeHost();
    const loop = seedDeliveryLoop(host);
    expect(receiptRequirement(loop, loop.plan.steps[0])).toEqual({ destination: 'saved-artifact' });
    loop.delivery = { destination: 'workspace-files' };
    expect(receiptRequirement(loop, loop.plan.steps[0])).toBeUndefined();
  });

  it('derives the requirement from placement when the user never chose', () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan); // worktree fixture
    delete loop.delivery;
    expect(receiptRequirement(loop, loop.plan.steps[0])).toEqual({ destination: 'pr' });
  });

  it('lists the exact structural problems with a claim', () => {
    const delivery = { destination: 'saved-artifact' as const };
    expect(deliveryProblems(delivery, { status: 'succeeded', summary: 'no claim' })).toEqual([]);
    expect(deliveryProblems(delivery, completing())[0]).toContain('no "receipt"');
    expect(deliveryProblems(delivery, completing({ ...RECEIPT, destination: 'chat-post' }))[0]).toContain('"chat-post"');
    expect(deliveryProblems(delivery, completing({ ...RECEIPT, deliveredAt: 'yesterday-ish' }))[0]).toContain('not a valid timestamp');
    expect(deliveryProblems(delivery, completing(RECEIPT))).toEqual([]);
  });

  it('does not demand a receipt for a planned block (nothing was delivered)', () => {
    const delivery = { destination: 'saved-artifact' as const };
    const blocked: StepOutcome = { status: 'blocked', summary: 'cannot', completion: { status: 'blocked', reason: 'impossible' } };
    expect(deliveryProblems(delivery, blocked)).toEqual([]);
  });

  it('downgrades an unproven completion to needs-revision, keeping variables', () => {
    const host = createFakeHost();
    const loop = seedDeliveryLoop(host);
    const outcome: StepOutcome = { ...completing(), variables: { kept: true } };
    const enforced = enforceDeliveryContract(loop, loop.plan.steps[0], outcome);
    expect(enforced.status).toBe('needs-revision');
    expect(enforced.completion).toBeUndefined();
    expect(enforced.variables).toEqual({ kept: true });
    expect(enforced.summary).toContain('proof of delivery');
  });

  it('passes a structurally valid claim through untouched', () => {
    const host = createFakeHost();
    const loop = seedDeliveryLoop(host);
    const outcome = completing(RECEIPT);
    expect(enforceDeliveryContract(loop, loop.plan.steps[0], outcome)).toBe(outcome);
  });

  it('writes a repair prompt naming the problems and the expected shape', () => {
    const text = formatDeliveryRepair({ destination: 'chat-post' }, ['the completion has no "receipt"']);
    expect(text).toContain('chat-post');
    expect(text).toContain('no "receipt"');
    expect(text).toContain('"deliveredAt"');
    expect(text).toContain('do not claim completion');
  });
});

describe('verifyReceipt', () => {
  it('accepts a pr receipt matching an open PR and rejects an unknown one', async () => {
    const host = createFakeHost();
    const loop = seedDeliveryLoop(host, 'pr');
    host.pullRequests = [{ number: 7, url: 'https://github.com/o/r/pull/7', title: 't', headRefName: 'orchestrator/loop-1', updatedAt: 'now' }];
    expect(await verifyReceipt(host, loop, { ...RECEIPT, destination: 'pr', ref: 'https://github.com/o/r/pull/7' })).toEqual({ ok: true });
    const missed = await verifyReceipt(host, loop, { ...RECEIPT, destination: 'pr', ref: 'https://github.com/o/r/pull/999' });
    expect(missed.ok).toBe(false);
  });

  it('fails soft when the PR list itself cannot be read', async () => {
    const host = createFakeHost();
    const loop = seedDeliveryLoop(host, 'pr');
    host.listPullRequests = async () => { throw new Error('gh missing'); };
    expect(await verifyReceipt(host, loop, { ...RECEIPT, destination: 'pr', ref: 'https://x' })).toEqual({ ok: true });
  });

  it('checks saved-artifact existence, resolving relative refs against the loop cwd', async () => {
    const host = createFakeHost();
    const loop = seedDeliveryLoop(host);
    loop.runtime.workspace.resolved = {
      id: 'ws', type: 'managed-worktree', workspaceRoot: host.workspacePath,
      cwd: `${host.workspacePath}/.sero/worktrees/loop-1`, worktreePath: `${host.workspacePath}/.sero/worktrees/loop-1`,
      branchName: 'orchestrator/loop-1', resolvedBy: 'create-option', createdAt: 't',
    };
    host.commandResults.push({ stdout: '', stderr: '', exitCode: 0 });
    expect(await verifyReceipt(host, loop, RECEIPT)).toEqual({ ok: true });
    expect(host.commands[0]).toBe(`test -f '${host.workspacePath}/.sero/worktrees/loop-1/reports/digest.md'`);

    host.commandResults.push({ stdout: '', stderr: '', exitCode: 1 });
    const missing = await verifyReceipt(host, loop, RECEIPT);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toContain('does not exist');
  });

  it('takes other destinations on the receipt contract alone in v1', async () => {
    const host = createFakeHost();
    const loop = seedDeliveryLoop(host, 'chat-post');
    expect(await verifyReceipt(host, loop, { ...RECEIPT, destination: 'chat-post', ref: 'https://chat/permalink' })).toEqual({ ok: true });
  });
});

describe('delivery enforcement through the engine', () => {
  it('refuses an unproven completion: the loop does not complete and recovery is consulted', async () => {
    const host = createFakeHost();
    seedDeliveryLoop(host);
    await engine(host, { 'step-1': completing() }).requestAction({ kind: 'run_next', loopId: 'loop-1' });
    const loop = host.state.loops[0];
    expect(loop.status).toBe('active'); // NOT complete
    expect(loop.runtime.stepStates['step-1'].status).toBe('needs-revision');
    expect(loop.runs[0].recoveryDecisions).toHaveLength(1);
    expect(loop.runtime.deliveries ?? []).toHaveLength(0);
  });

  it('completes with a verified receipt and appends it to runtime.deliveries and the run summary', async () => {
    const host = createFakeHost();
    seedDeliveryLoop(host);
    host.commandResults.push({ stdout: '', stderr: '', exitCode: 0 }); // verify-back: file exists
    await engine(host, { 'step-1': completing(RECEIPT) }).requestAction({ kind: 'run_next', loopId: 'loop-1' });
    const loop = host.state.loops[0];
    expect(loop.status).toBe('complete');
    expect(loop.runtime.deliveries).toEqual([RECEIPT]);
    expect(loop.runtime.completion?.receipt).toEqual(RECEIPT);
    expect(toRunSummary(loop.runs[0]).delivery).toEqual(RECEIPT);
    const note = outcomeNotification(loop);
    expect(note?.message).toContain(RECEIPT.ref);
  });

  it('treats a verify-back failure exactly like a missing receipt', async () => {
    const host = createFakeHost();
    seedDeliveryLoop(host);
    host.commandResults.push({ stdout: '', stderr: '', exitCode: 1 }); // file does not exist
    await engine(host, { 'step-1': completing(RECEIPT) }).requestAction({ kind: 'run_next', loopId: 'loop-1' });
    const loop = host.state.loops[0];
    expect(loop.status).toBe('active');
    expect(loop.runtime.stepStates['step-1'].status).toBe('needs-revision');
    expect(loop.runtime.deliveries ?? []).toHaveLength(0);
  });

  it('never demands a receipt from a workspace-files loop', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan); // fixture delivery: workspace-files
    await engine(host, { 'step-1': completing() }).requestAction({ kind: 'run_next', loopId: 'loop-1' });
    expect(host.state.loops[0].status).toBe('complete');
  });
});

describe('recordCompletion delivery history', () => {
  const attempt = (host: FakeHost): StepAttempt => ({
    id: host.newId('attempt'), stepId: 'step-1', attemptNumber: 1, parentSessionId: 'p',
    executionType: 'background-agent', status: 'completed', observations: [], startedAt: host.now(), endedAt: host.now(),
  });

  it('appends the receipt for a recurring iteration while the loop stays active', () => {
    const host = createFakeHost();
    const loop = seedDeliveryLoop(host);
    loop.triggers = [{ id: 't1', loopId: loop.id, workspaceId: 'ws-1', type: 'cron', schedule: '0 * * * *', fireCount: 0, nextFireAt: '2026-01-01T01:00:00.000Z' }];
    const result = recordCompletion(host, loop, 'step-1', attempt(host), completing(RECEIPT));
    expect(result.loop.status).toBe('active');
    expect(result.loop.runtime.deliveries).toEqual([RECEIPT]);
    expect(result.signal.receipt).toEqual(RECEIPT);
  });

  it('caps the history at the newest 20 receipts', () => {
    const host = createFakeHost();
    const loop = seedDeliveryLoop(host);
    loop.runtime.deliveries = Array.from({ length: 20 }, (_, i) => ({ ...RECEIPT, ref: `reports/r${i}.md` }));
    const result = recordCompletion(host, loop, 'step-1', attempt(host), completing(RECEIPT));
    const deliveries = result.loop.runtime.deliveries!;
    expect(deliveries).toHaveLength(20);
    expect(deliveries[19]).toEqual(RECEIPT); // newest last
    expect(deliveries[0].ref).toBe('reports/r1.md'); // oldest dropped
  });
});
