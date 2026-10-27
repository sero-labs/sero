/**
 * Three more loops, each there to reach actions the manual loop cannot:
 *  - a recurring loop (cron): schedule changes, disable and enable, run again;
 *  - a recovery loop whose one step fails twice: retries and recovery;
 *  - an ask loop whose planner asks a question first: answering it and delivery.
 */
import { expectOk, expectText } from '../expect';
import type { ScenarioStep, StepContext } from '../types';
import { must } from './cron-memory-support';
import { FIRST_SCHEDULE, RECOVERY_STEP_ID } from './orchestrator-plans';
import { stubOf } from './orchestrator-stub';
import {
  ASK_ANSWER,
  ASK_PROMPT,
  createParams,
  expectLoopGone,
  idFromText,
  loopIdOf,
  loopWhen,
  readLoop,
  readRuns,
  RECOVERY_PROMPT,
  RECURRING,
  RECURRING_PROMPT,
  saveLoopId,
  type LoopKey,
} from './orchestrator-support';

const SECOND_SCHEDULE = '30 4 2 2 *';
const recurringId = (ctx: StepContext): string => loopIdOf(ctx, 'recurring');
const recoveryId = (ctx: StepContext): string => loopIdOf(ctx, 'recovery');
const askId = (ctx: StepContext): string => loopIdOf(ctx, 'ask');

async function cronTrigger(ctx: StepContext) {
  const trigger = (await readLoop(ctx, recurringId(ctx))).triggers.find((candidate) => candidate.type === 'cron');
  must(trigger, 'the recurring loop has no cron trigger');
  return trigger;
}

async function saveTriggerId(ctx: StepContext): Promise<void> {
  ctx.state['orchestrator:triggerId'] = (await cronTrigger(ctx)).id;
}

function triggerIdOf(ctx: StepContext): string {
  const id = ctx.state['orchestrator:triggerId'];
  must(typeof id === 'string', 'no trigger id was saved');
  return id;
}

/** The recurring loop has run `n` times, each run reached a step session, and the loop is still scheduled. */
async function expectRecurringRuns(ctx: StepContext, n: number): Promise<void> {
  const id = recurringId(ctx);
  const loop = await loopWhen(ctx, id, `${n} run(s) of the recurring loop`, (l) => !l.runtime.activeRunId && l.status === 'active');
  const runs = await readRuns(ctx, id);
  must(runs.length === n && runs.every((run) => run.completionStatus === 'complete'), `the recurring loop's runs are ${JSON.stringify(runs)}`);
  must(stubOf(ctx).steps.filter((session) => session.token === RECURRING).length === n, 'a run did not reach a step session');
  must(loop.runtime.stepStates.tick?.status === 'succeeded', 'the step did not succeed');
}

export const recurringSteps: ScenarioStep[] = [
  {
    action: 'create',
    params: createParams(RECURRING_PROMPT),
    async expect(result, ctx) {
      expectText(result, '(status: draft)');
      const id = idFromText(result, /Created loop (\S+) —/);
      saveLoopId(ctx, 'recurring', id);
      const trigger = await cronTrigger(ctx);
      must(trigger.schedule === FIRST_SCHEDULE && trigger.nextFireAt, `the trigger is ${JSON.stringify(trigger)}`);
    },
  },
  {
    // Pausing a schedule keeps it and drops the next fire.
    action: 'set_schedule',
    setup: saveTriggerId,
    params: (ctx) => ({
      action: 'set_schedule',
      loopId: recurringId(ctx),
      triggerId: triggerIdOf(ctx),
      schedule: SECOND_SCHEDULE,
      scheduleDisabled: true,
    }),
    async expect(result, ctx) {
      expectText(result, `schedule is now "${SECOND_SCHEDULE}" (paused)`);
      const trigger = await cronTrigger(ctx);
      must(trigger.schedule === SECOND_SCHEDULE && trigger.scheduleDisabled === true && !trigger.nextFireAt, `the trigger is ${JSON.stringify(trigger)}`);
    },
  },
  {
    action: 'set_schedule',
    params: (ctx) => ({ action: 'set_schedule', loopId: recurringId(ctx), triggerId: triggerIdOf(ctx), scheduleDisabled: false }),
    async expect(result, ctx) {
      expectText(result, `schedule is now "${SECOND_SCHEDULE}" — next fire `);
      const trigger = await cronTrigger(ctx);
      must(trigger.scheduleDisabled === false && trigger.schedule === SECOND_SCHEDULE && trigger.nextFireAt, `the trigger is ${JSON.stringify(trigger)}`);
    },
  },
  {
    action: 'disable',
    params: (ctx) => ({ action: 'disable', loopId: recurringId(ctx) }),
    async expect(result, ctx) {
      expectText(result, 'disable ok');
      must((await readLoop(ctx, recurringId(ctx))).status === 'disabled', 'the loop is not disabled');
    },
  },
  {
    // Turning a loop back on runs its first pass.
    action: 'enable',
    params: (ctx) => ({ action: 'enable', loopId: recurringId(ctx) }),
    timeoutMs: 120_000,
    async expect(result, ctx) {
      expectText(result, 'enable ok');
      await expectRecurringRuns(ctx, 1);
    },
  },
  {
    // A settled pass on a recurring loop starts a fresh iteration.
    action: 'run_next',
    params: (ctx) => ({ action: 'run_next', loopId: recurringId(ctx) }),
    timeoutMs: 120_000,
    async expect(result, ctx) {
      expectText(result, 'run_next ok');
      await expectRecurringRuns(ctx, 2);
    },
  },
  {
    action: 'run_again',
    params: (ctx) => ({ action: 'run_again', loopId: recurringId(ctx) }),
    timeoutMs: 120_000,
    async expect(result, ctx) {
      expectText(result, 'run_again ok');
      await expectRecurringRuns(ctx, 3);
    },
  },
];

// ── Recovery ────────────────────────────────────────────────────────────────

async function expectRecoveryState(ctx: StepContext, status: string, step: string, runs: number): Promise<void> {
  const id = recoveryId(ctx);
  const loop = await loopWhen(ctx, id, `the recovery loop to be ${status}`, (l) => l.status === status && !l.runtime.activeRunId);
  must(loop.runtime.stepStates[RECOVERY_STEP_ID]?.status === step, `the step is ${loop.runtime.stepStates[RECOVERY_STEP_ID]?.status}, expected ${step}`);
  must((await readRuns(ctx, id)).length === runs, `the loop has ${(await readRuns(ctx, id)).length} runs, expected ${runs}`);
}

export const recoverySteps: ScenarioStep[] = [
  {
    action: 'create',
    params: createParams(RECOVERY_PROMPT),
    async expect(result, ctx) {
      expectText(result, '(status: draft)');
      const id = idFromText(result, /Created loop (\S+) —/);
      saveLoopId(ctx, 'recovery', id);
      const loop = await readLoop(ctx, id);
      must(loop.plan.steps.map((step) => step.id).join() === RECOVERY_STEP_ID, 'the planner\'s one-step plan was not saved');
    },
  },
  {
    // The step fails on its first try and the decider blocks the loop.
    action: 'activate',
    params: (ctx) => ({ action: 'activate', loopId: recoveryId(ctx) }),
    timeoutMs: 120_000,
    async expect(result, ctx) {
      expectText(result, 'activate ok');
      await expectRecoveryState(ctx, 'blocked', 'failed', 1);
      const loop = await readLoop(ctx, recoveryId(ctx));
      must(loop.runtime.block?.kind === 'recovery-block', `the block is ${JSON.stringify(loop.runtime.block)}`);
      ctx.state['orchestrator:failedAttempt'] = loop.runtime.stepStates[RECOVERY_STEP_ID]?.lastAttemptId;
    },
  },
  {
    // A decision the user picks by hand: run the step again. The loop itself stays blocked until it is retried.
    action: 'choose_recovery',
    params: (ctx) => ({
      action: 'choose_recovery',
      loopId: recoveryId(ctx),
      decisionJson: JSON.stringify({
        id: 'tc-orch-decision',
        stepId: RECOVERY_STEP_ID,
        failedAttemptId: String(ctx.state['orchestrator:failedAttempt']),
        decision: 'retry-step',
        reason: 'tc-orch: run the step again',
        createdAt: new Date().toISOString(),
      }),
    }),
    async expect(result, ctx) {
      expectText(result, 'choose_recovery ok');
      const loop = await readLoop(ctx, recoveryId(ctx));
      must(loop.runtime.stepStates[RECOVERY_STEP_ID]?.status === 'pending', `the step is ${loop.runtime.stepStates[RECOVERY_STEP_ID]?.status}`);
    },
  },
  {
    // The step fails a second time and the loop blocks again.
    action: 'retry',
    params: (ctx) => ({ action: 'retry', loopId: recoveryId(ctx) }),
    timeoutMs: 120_000,
    async expect(result, ctx) {
      expectText(result, 'retry ok');
      await expectRecoveryState(ctx, 'blocked', 'failed', 2);
    },
  },
  {
    // The third try passes and, being the final step, completes the loop.
    action: 'retry_step',
    params: (ctx) => ({ action: 'retry_step', loopId: recoveryId(ctx), stepId: RECOVERY_STEP_ID }),
    timeoutMs: 120_000,
    async expect(result, ctx) {
      expectText(result, `Retried step "${RECOVERY_STEP_ID}"`);
      await expectRecoveryState(ctx, 'complete', 'succeeded', 3);
      must((await readLoop(ctx, recoveryId(ctx))).runtime.completion?.status === 'complete', 'the loop recorded no completion');
    },
  },
];

// ── A planner question ──────────────────────────────────────────────────────

export const askSteps: ScenarioStep[] = [
  {
    // The planner needs an answer before it can write a plan, so the draft waits on a question.
    action: 'create',
    params: createParams(ASK_PROMPT),
    async expect(result, ctx) {
      expectText(result, '(status: draft)');
      const id = idFromText(result, /Created loop (\S+) —/);
      saveLoopId(ctx, 'ask', id);
      const loop = await readLoop(ctx, id);
      const pending = loop.runtime.pendingInput;
      must(pending?.source === 'planner' && pending.questions[0]?.id === 'folder', `the pending question is ${JSON.stringify(pending)}`);
      must(loop.plan.steps.length === 0, 'a plan was written before the question was answered');
      ctx.state['orchestrator:requestId'] = pending.id;
    },
  },
  {
    action: 'answer_input',
    params: (ctx) => ({
      action: 'answer_input',
      loopId: askId(ctx),
      requestId: String(ctx.state['orchestrator:requestId']),
      answersJson: JSON.stringify([{ questionId: 'folder', choiceId: 'staging', text: ASK_ANSWER }]),
    }),
    timeoutMs: 120_000,
    async expect(result, ctx) {
      expectText(result, `Answer recorded for loop ${askId(ctx)}`);
      const loop = await readLoop(ctx, askId(ctx));
      must(!loop.runtime.pendingInput, 'the question is still pending');
      must(loop.answeredInputs?.length === 1 && loop.answeredInputs[0]!.answers[0]?.choiceId === 'staging', `the answer was not recorded: ${JSON.stringify(loop.answeredInputs)}`);
      // Answering sent the planner back to work with the answer in its task.
      must(loop.plan.steps.length === 1 && loop.plan.steps[0]!.id === 'draft', `the re-plan is ${JSON.stringify(loop.plan.steps)}`);
    },
  },
  {
    action: 'set_delivery',
    params: (ctx) => ({
      action: 'set_delivery',
      loopId: askId(ctx),
      deliveryDestination: 'saved-artifact',
      deliveryParamsJson: JSON.stringify({ name: 'tc-orch-report' }),
    }),
    async expect(result, ctx) {
      expectText(result, `Loop ${askId(ctx)} now delivers to "saved-artifact".`);
      const delivery = (await readLoop(ctx, askId(ctx))).delivery;
      must(delivery?.destination === 'saved-artifact' && delivery.params?.name === 'tc-orch-report', `the delivery is ${JSON.stringify(delivery)}`);
    },
  },
  deleteStep('ask'),
];

/** Deleting a loop removes its folder and its row in the index. */
export function deleteStep(key: LoopKey): ScenarioStep {
  return {
    action: 'delete',
    params: (ctx) => ({ action: 'delete', loopId: loopIdOf(ctx, key) }),
    async expect(result, ctx) {
      expectOk(result);
      expectText(result, `Deleted loop ${loopIdOf(ctx, key)}.`);
      await expectLoopGone(ctx, loopIdOf(ctx, key));
    },
  };
}
