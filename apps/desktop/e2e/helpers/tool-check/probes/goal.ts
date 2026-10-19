/**
 * The `goal` tool, all seven actions, and the three terminal tools
 * (`goal_wait`, `goal_blocked`, `goal_complete`), in one chat session. A
 * session is given the terminal tools only while its goal is active, and a
 * `start` or `resume` turns them on within the same turn.
 *
 * The first goal waits, is resumed, blocks, is resumed and is stopped. A
 * second goal is then reported complete, because a stopped goal cannot be. The
 * probe never leaves a goal active: one still active when the chat turn
 * settles would start an automatic continuation turn, which the scenario
 * driver would answer as the chat's own.
 */
import path from 'node:path';
import { expectText } from '../expect';
import type { ScenarioStep, StepContext, ToolProbe } from '../types';
import { must, readJson } from './cron-memory-support';
import { orchestratorDir } from './orchestrator-support';

const OBJECTIVE = 'tc-goal: leave one short note for the probe';
const OBJECTIVE_TWO = 'tc-goal: report the note done';
const CRITERIA = ['the note exists', 'the note is short'];
const WAIT_REASON = 'tc-goal: waiting on the probe';
const BLOCK_REASON = 'tc-goal: blocked by the probe';
const EVIDENCE = 'tc-goal: the probe wrote the note and read it back';

/** The fields of `goals/<id>.json` a step checks (`shared/goal-types.ts`). */
interface GoalFile {
  id: string;
  status: string;
  objective: string;
  criteria: string[];
  limits: { maxAttemptsTotal?: number };
  limitOrigins?: { maxAttemptsTotal?: string };
  pauseReason?: string;
  closedAt?: string;
  usage: { automaticTurns: number };
}

function goalId(ctx: StepContext, key = 'goal:id'): string {
  const id = ctx.state[key];
  must(typeof id === 'string', 'no goal id was saved by the start step');
  return id;
}

async function readGoal(ctx: StepContext, id: string): Promise<GoalFile> {
  const goal = await readJson<GoalFile>(path.join(orchestratorDir(ctx), 'goals', `${id}.json`));
  must(goal, `goals/${id}.json is not in the workspace's orchestrator folder`);
  return goal;
}

/** One row of the `goals/index.json` the management view watches. */
async function indexedStatus(ctx: StepContext, id: string): Promise<string | undefined> {
  const index = await readJson<{ goals: Array<{ id: string; status: string }> }>(path.join(orchestratorDir(ctx), 'goals', 'index.json'));
  return index?.goals.find((entry) => entry.id === id)?.status;
}

/** Checks the goal file and the index both show `status`. */
async function expectStatus(ctx: StepContext, id: string, status: string): Promise<GoalFile> {
  const goal = await readGoal(ctx, id);
  must(goal.status === status, `the goal is ${goal.status}, expected ${status}`);
  must((await indexedStatus(ctx, id)) === status, 'the goals index does not show the new status');
  return goal;
}

/** A step that moves the goal to `status`. */
function control(action: 'pause' | 'resume' | 'stop', text: (id: string) => string, status: string, more?: (goal: GoalFile) => void): ScenarioStep {
  return {
    action,
    params: (ctx) => ({ action, goalId: goalId(ctx) }),
    async expect(result, ctx) {
      const id = goalId(ctx);
      expectText(result, text(id));
      more?.(await expectStatus(ctx, id, status));
    },
  };
}

/** A terminal tool call on the goal saved under `key`, which leaves it at `status`. */
function terminal(tool: string, key: string, params: Record<string, unknown>, text: (id: string) => string, status: string): ScenarioStep {
  return {
    tool,
    // The goal's start turns these on as tools of the session, which a model calls by name.
    via: 'direct',
    action: null,
    params: (ctx) => ({ goal_id: goalId(ctx, key), ...params }),
    async expect(result, ctx) {
      const id = goalId(ctx, key);
      expectText(result, text(id));
      await expectStatus(ctx, id, status);
    },
  };
}

const resume = control('resume', (id) => `Goal ${id} is active again — 0 of 8 automatic turns used.`, 'active');

/** Starts a goal and saves its id under `key`. */
function startStep(objective: string, key: string): ScenarioStep {
  return {
    action: 'start',
    params: { action: 'start', objective, criteria: CRITERIA.join('; '), maxTurns: 12 },
    async expect(result, ctx) {
      expectText(result, ' is active — 0 of 12 automatic turns used.');
      const id = /Goal (\S+) is active/.exec(result.text)?.[1];
      must(id, `no goal id in: ${result.text}`);
      ctx.state[key] = id;
      const goal = await readGoal(ctx, id);
      must(goal.status === 'active' && goal.objective === objective, `the saved goal is ${goal.status}, ${goal.objective}`);
      must(JSON.stringify(goal.criteria) === JSON.stringify(CRITERIA), `the criteria are ${JSON.stringify(goal.criteria)}`);
      must(goal.limits.maxAttemptsTotal === 12 && goal.limitOrigins?.maxAttemptsTotal === 'agent', `the limits are ${JSON.stringify(goal.limits)}`);
      must((await indexedStatus(ctx, id)) === 'active', 'the goals index does not list the goal');
    },
  };
}

export const goalProbe: ToolProbe = {
  tool: 'goal',
  steps: [
    startStep(OBJECTIVE, 'goal:id'),
    {
      action: 'status',
      params: { action: 'status' },
      expect(result, ctx) {
        expectText(result, `${goalId(ctx)} · active · 0/12 turns · ${OBJECTIVE}`);
        expectText(result, `Criteria: ${CRITERIA.join('; ')}`);
      },
    },
    {
      // The agent that started the goal may tighten its own turn budget.
      action: 'set_limits',
      params: (ctx) => ({ action: 'set_limits', goalId: goalId(ctx), maxTurns: 8 }),
      async expect(result, ctx) {
        expectText(result, `Goal ${goalId(ctx)} budgets updated — 0 of 8 automatic turns used.`);
        const goal = await readGoal(ctx, goalId(ctx));
        must(goal.limits.maxAttemptsTotal === 8 && goal.status === 'active', `the goal's limits are ${JSON.stringify(goal.limits)}, status ${goal.status}`);
      },
    },
    control('pause', (id) => `Goal ${id} is paused`, 'paused', (goal) => must(goal.pauseReason === 'user', `the pause reason is ${goal.pauseReason}`)),
    resume,
    // A wait with no source is the manual wait: nothing wakes the goal, the resume does.
    terminal('goal_wait', 'goal:id', { reason: WAIT_REASON }, (id) => `Goal ${id} is waiting: ${WAIT_REASON}.`, 'waiting'),
    resume,
    terminal('goal_blocked', 'goal:id', { reason: BLOCK_REASON, evidence: EVIDENCE }, (id) => `Goal ${id} is blocked.`, 'blocked'),
    resume,
    control('stop', (id) => `Goal ${id} is stopped.`, 'paused', (goal) => must(goal.closedAt, 'a stopped goal has no closing time')),
    {
      action: 'list',
      params: { action: 'list' },
      expect(result, ctx) {
        expectText(result, `${goalId(ctx)} · stopped · 0/8 turns · ${OBJECTIVE}`);
      },
    },
    startStep(OBJECTIVE_TWO, 'goal:two'),
    terminal('goal_complete', 'goal:two', { evidence: EVIDENCE }, (id) => `Goal ${id} is reported complete.`, 'complete'),
  ],
  // The workspace's goals, as the action pass left them.
  siteStep: {
    action: 'list',
    params: { action: 'list' },
    expect: (result) => expectText(result, OBJECTIVE),
  },
};
