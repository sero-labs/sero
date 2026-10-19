/**
 * The manual loop: a one-step Workflow the probe creates, tunes and runs once.
 * It is the base the learning, skill and library steps build on.
 */
import { expectOk, expectText } from '../expect';
import type { ScenarioStep, StepContext } from '../types';
import { must } from './cron-memory-support';
import { installOrchestratorResponder } from './orchestrator-stub';
import {
  createParams,
  idFromText,
  indexedLoopIds,
  loopIdOf,
  loopWhen,
  MANUAL_PROMPT,
  readLoop,
  readRuns,
  saveLoopId,
} from './orchestrator-support';

const STEP_ID = 'work';
// A tier, since every tier is the stub model here; the planner wrote LOW.
const MODEL = 'MED';
const CONTEXT_LINE = 'tc-orch context: answer in one short paragraph.';
const AGENT = 'tc-orch-missing-agent';

const manualId = (ctx: StepContext): string => loopIdOf(ctx, 'manual');

export const manualSteps: ScenarioStep[] = [
  {
    action: 'create',
    setup: async (ctx) => installOrchestratorResponder(ctx),
    params: createParams(MANUAL_PROMPT),
    async expect(result, ctx) {
      expectText(result, '(status: draft)');
      const id = idFromText(result, /Created loop (\S+) —/);
      saveLoopId(ctx, 'manual', id);
      const loop = await readLoop(ctx, id);
      must(loop.status === 'draft' && loop.prompt === MANUAL_PROMPT, `the saved loop is wrong: ${loop.status}, ${loop.prompt}`);
      must(loop.plan.steps.length === 1 && loop.plan.steps[0]!.id === STEP_ID, `the planner's plan was not saved: ${JSON.stringify(loop.plan.steps)}`);
      must(loop.limits.maxCostUsd === 1 && loop.limits.maxTotalTokens === 100_000, `the suggested limits were not saved: ${JSON.stringify(loop.limits)}`);
      must(loop.runtime.stepStates[STEP_ID]?.status === 'pending', 'the step has no pending state');
    },
  },
  {
    action: 'show',
    params: (ctx) => ({ action: 'show', loopId: manualId(ctx) }),
    expect(result, ctx) {
      expectText(result, `Loop ${manualId(ctx)} — "tc-orch manual loop" (status: draft).`);
    },
  },
  {
    action: 'list',
    params: { action: 'list' },
    async expect(result, ctx) {
      expectOk(result);
      const count = /(\d+) loop\(s\)\./.exec(result.text)?.[1];
      const listed = await indexedLoopIds(ctx);
      must(count !== undefined && Number(count) === listed.length, `list said ${result.text}, the index holds ${listed.length}`);
      must(listed.includes(manualId(ctx)), 'the manual loop is not in the index');
    },
  },
  {
    action: 'set_step_model',
    params: (ctx) => ({ action: 'set_step_model', loopId: manualId(ctx), stepId: STEP_ID, model: MODEL, thinking: 'low' }),
    async expect(result, ctx) {
      expectText(result, 'set_step_model ok');
      const step = (await readLoop(ctx, manualId(ctx))).plan.steps[0]!;
      must(step.execution.model === MODEL && step.execution.thinking === 'low', `the step's model is ${JSON.stringify(step.execution)}`);
    },
  },
  {
    // `bash` is always on, so only the extra tool is stored.
    action: 'set_step_tools',
    params: (ctx) => ({ action: 'set_step_tools', loopId: manualId(ctx), stepId: STEP_ID, toolsJson: JSON.stringify(['bash', 'current_time']) }),
    async expect(result, ctx) {
      expectText(result, 'set_step_tools ok');
      const step = (await readLoop(ctx, manualId(ctx))).plan.steps[0]!;
      must(JSON.stringify(step.execution.tools) === JSON.stringify(['current_time']), `the step's tools are ${JSON.stringify(step.execution.tools)}`);
    },
  },
  {
    action: 'set_step_agent',
    params: (ctx) => ({ action: 'set_step_agent', loopId: manualId(ctx), stepId: STEP_ID, agent: AGENT }),
    async expect(result, ctx) {
      expectText(result, 'set_step_agent ok');
      const step = (await readLoop(ctx, manualId(ctx))).plan.steps[0]!;
      must(step.execution.agent === AGENT, `the step's agent is ${JSON.stringify(step.execution.agent)}`);
    },
  },
  {
    action: 'set_loop_context',
    params: (ctx) => ({
      action: 'set_loop_context',
      loopId: manualId(ctx),
      contextJson: JSON.stringify({ systemPrompt: CONTEXT_LINE, disabledTools: ['edit'] }),
    }),
    async expect(result, ctx) {
      expectText(result, 'set_loop_context ok');
      const overrides = (await readLoop(ctx, manualId(ctx))).contextOverrides;
      must(overrides?.systemPrompt === CONTEXT_LINE && overrides.disabledTools?.[0] === 'edit', `the context override is ${JSON.stringify(overrides)}`);
    },
  },
  {
    // The planner suggested a $1 cap and a token cap. A new dollar cap replaces both.
    action: 'use_cost_budget',
    params: (ctx) => ({ action: 'use_cost_budget', loopId: manualId(ctx), maxCostUsd: 5 }),
    async expect(result, ctx) {
      expectText(result, 'Cost budget updated');
      const { limits } = await readLoop(ctx, manualId(ctx));
      must(limits.maxCostUsd === 5 && limits.maxTotalTokens === undefined, `the limits are ${JSON.stringify(limits)}`);
    },
  },
  {
    // Activating runs the whole pass inside the call, so the step session has run by the time it returns.
    action: 'activate',
    params: (ctx) => ({ action: 'activate', loopId: manualId(ctx) }),
    timeoutMs: 120_000,
    async expect(result, ctx) {
      expectText(result, 'activate ok');
      const id = manualId(ctx);
      const loop = await loopWhen(ctx, id, 'the manual loop to finish its run', (l) => l.status === 'complete' && !l.runtime.activeRunId);
      must(loop.runtime.stepStates[STEP_ID]?.status === 'succeeded', `the step is ${loop.runtime.stepStates[STEP_ID]?.status}`);
      must(loop.runtime.completion?.status === 'complete', 'the loop recorded no completion');
      const runs = await readRuns(ctx, id);
      must(runs.length === 1 && runs[0]!.completionStatus === 'complete', `the runs are ${JSON.stringify(runs)}`);
      // The step's agent role reached the run: no such role exists, so the run fell back and said so.
      must(loop.warnings.some((warning) => warning.code === 'agent-unavailable' && warning.stepId === STEP_ID), `an unknown agent raised no warning: ${JSON.stringify(loop.warnings)}`);
    },
  },
];
