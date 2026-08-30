import { describe, expect, it } from 'vitest';
import { GoalRuntime } from '../goals/goal-runtime';
import { createGoalStore, type GoalStoreIo } from '../goals/goal-store';
import { SessionDrivers } from '../session-drivers';
import type { GoalTurnReport } from '../../shared/goal-types';
import { createFakeHost, type FakeHost } from './fake-host';

const SESSION = '/sessions/chat-1.jsonl';

/** In-memory app-state, so a goal record survives within a test but not beyond it. */
function memoryIo(files = new Map<string, unknown>()): GoalStoreIo & { files: Map<string, unknown> } {
  return {
    files,
    async read<T>(file: string) {
      return (files.get(file) as T) ?? null;
    },
    async write<T>(file: string, data: T) {
      files.set(file, structuredClone(data));
    },
  };
}

function createRuntime(host: FakeHost = createFakeHost(), io = memoryIo(), drivers = new SessionDrivers()) {
  return { host, io, drivers, runtime: new GoalRuntime(host, createGoalStore(io, '/state'), drivers) };
}

const turn = (goalId: string, overrides: Partial<GoalTurnReport> = {}): GoalTurnReport => ({
  goalId,
  sessionPath: SESSION,
  fingerprint: 'same',
  toolAttempted: false,
  automatic: true,
  totalTokens: 100,
  costUsd: 0.01,
  ...overrides,
});

async function startGoal(runtime: GoalRuntime, limits = {}) {
  const started = await runtime.start({ sessionPath: SESSION, objective: 'make the tests pass', criteria: [], limits });
  if (!started.goal) throw new Error(started.text);
  return started.goal;
}

describe('goal budgets', () => {
  it('writes list data to the watched Goal index', async () => {
    const { io, runtime } = createRuntime();
    const goal = await startGoal(runtime, { maxAttemptsTotal: 25 });
    await runtime.checkContinue(turn(goal.id, { fingerprint: 'made-progress', toolAttempted: true }));

    expect(io.files.get('/state/goals/index.json')).toMatchObject({
      schemaVersion: 1,
      goals: [{
        id: goal.id,
        objective: 'make the tests pass',
        status: 'active',
        sessionPath: SESSION,
        sessionId: 'sess-1',
        automaticTurns: 1,
        maxAutomaticTurns: 25,
        costUsd: 0.01,
      }],
    });
  });

  it('charges a turn the goal started and not a turn the user started', async () => {
    const { runtime } = createRuntime();
    const goal = await startGoal(runtime);

    await runtime.checkContinue(turn(goal.id, { automatic: false, fingerprint: 'a' }));
    const afterUser = await runtime.forSession(SESSION);
    expect(afterUser?.usage.automaticTurns).toBe(0);
    expect(afterUser?.usage.totalTokens).toBe(0);

    await runtime.checkContinue(turn(goal.id, { fingerprint: 'b' }));
    const afterGoal = await runtime.forSession(SESSION);
    expect(afterGoal?.usage.automaticTurns).toBe(1);
    expect(afterGoal?.usage.totalTokens).toBe(100);
  });

  it('reaching the turn cap gives a limited goal, never a complete one', async () => {
    const { runtime } = createRuntime();
    const goal = await startGoal(runtime, { maxAttemptsTotal: 2 });

    expect((await runtime.checkContinue(turn(goal.id, { fingerprint: 'a' }))).kind).toBe('continue');
    const verdict = await runtime.checkContinue(turn(goal.id, { fingerprint: 'b' }));

    expect(verdict.kind).toBe('limited');
    expect(verdict.goal?.status).toBe('limited');
    expect(verdict.goal?.limitReached).toBe('maxAttemptsTotal');
  });

  it('refuses to resume a goal whose budget is still exhausted', async () => {
    const { runtime } = createRuntime();
    const goal = await startGoal(runtime, { maxAttemptsTotal: 1 });
    await runtime.checkContinue(turn(goal.id));

    const resumed = await runtime.resume(goal.id);
    expect(resumed.ok).toBe(false);
    expect(resumed.text).toContain('automatic turns');

    await runtime.setLimits(goal.id, { maxAttemptsTotal: 5 });
    expect((await runtime.resume(goal.id)).goal?.status).toBe('active');
  });

  it('re-checks budgets on restart before anything resumes', async () => {
    const { host, io, runtime } = createRuntime();
    const goal = await startGoal(runtime, { maxAttemptsTotal: 4 });
    await runtime.checkContinue(turn(goal.id));
    // A budget lowered below what the goal already spent, as a user would after
    // seeing the cost. The restart must not grant one more turn first.
    await runtime.setLimits(goal.id, { maxAttemptsTotal: 1 });

    const restarted = new GoalRuntime(host, createGoalStore(memoryIo(io.files), '/state'), new SessionDrivers());
    await restarted.reconcile();

    expect((await restarted.forSession(SESSION))?.status).toBe('limited');
  });
});

describe('the no-progress guard', () => {
  it('pauses after three identical outcomes that attempted nothing', async () => {
    const { runtime } = createRuntime();
    const goal = await startGoal(runtime);

    expect((await runtime.checkContinue(turn(goal.id))).kind).toBe('continue');
    expect((await runtime.checkContinue(turn(goal.id))).kind).toBe('continue');
    const verdict = await runtime.checkContinue(turn(goal.id));

    expect(verdict.kind).toBe('hold-no-progress');
    expect(verdict.goal?.status).toBe('paused');
    expect(verdict.goal?.pauseReason).toBe('no-progress');
  });

  it('an attempted tool call resets the ledger', async () => {
    const { runtime } = createRuntime();
    const goal = await startGoal(runtime);

    await runtime.checkContinue(turn(goal.id));
    await runtime.checkContinue(turn(goal.id, { toolAttempted: true }));
    const verdict = await runtime.checkContinue(turn(goal.id));

    expect(verdict.kind).toBe('continue');
  });
});

describe('terminal reports', () => {
  it('records a completion claim as reported, not verified', async () => {
    const { runtime } = createRuntime();
    const goal = await startGoal(runtime);

    const outcome = await runtime.reportComplete(goal.id, SESSION, 'the suite passes');

    expect(outcome.ok).toBe(true);
    expect(outcome.text).toContain('reported complete');
    expect(outcome.goal?.reportedComplete?.evidence).toBe('the suite passes');
  });

  it('refuses a terminal call carrying a stale goal id', async () => {
    const { runtime } = createRuntime();
    await startGoal(runtime);

    const outcome = await runtime.reportComplete('goal-from-a-cleared-conversation', SESSION, 'done');

    expect(outcome.ok).toBe(false);
    expect(outcome.text).toContain('not this session');
  });

  it('refuses a terminal call from another session', async () => {
    const { runtime } = createRuntime();
    const goal = await startGoal(runtime);

    const outcome = await runtime.reportComplete(goal.id, '/sessions/other.jsonl', 'done');

    expect(outcome.ok).toBe(false);
    expect(outcome.text).toContain('no goal');
  });

  it('a settled turn reported by another session cannot drive this goal', async () => {
    const { runtime } = createRuntime();
    const goal = await startGoal(runtime);

    const verdict = await runtime.checkContinue(turn(goal.id, { sessionPath: '/sessions/other.jsonl' }));

    expect(verdict.kind).toBe('inactive');
    expect((await runtime.forSession(SESSION))?.usage.automaticTurns).toBe(0);
  });
});

describe('one autonomous driver per session', () => {
  it('refuses a goal on a session a workflow step already drives', async () => {
    const { drivers, runtime } = createRuntime();
    drivers.claim('sess-1', { kind: 'workflow-step', ownerId: 'loop-9' });

    const started = await runtime.start({ sessionPath: SESSION, objective: 'do the thing', criteria: [] });

    expect(started.ok).toBe(false);
    expect(started.text).toContain('workflow loop-9');
  });

  it('holds the session while the goal runs and releases it when the goal ends', async () => {
    const { drivers, runtime } = createRuntime();
    const goal = await startGoal(runtime);

    expect(drivers.holderOf('sess-1')).toEqual({ kind: 'goal', ownerId: goal.id });
    await runtime.reportComplete(goal.id, SESSION, 'done');
    expect(drivers.holderOf('sess-1')).toBeUndefined();
  });

  it('starts without a lock when the workspace has no active session', async () => {
    const host = createFakeHost();
    host.activeSession = null;
    const { runtime } = createRuntime(host);

    const started = await runtime.start({ sessionPath: SESSION, objective: 'do the thing', criteria: [] });

    expect(started.ok).toBe(true);
    expect(started.goal?.sessionId).toBeNull();
  });
});

describe('the goal a session owns', () => {
  it('refuses a second goal while one is live, and allows one after a stop', async () => {
    const { runtime } = createRuntime();
    const goal = await startGoal(runtime);

    const second = await runtime.start({ sessionPath: SESSION, objective: 'another', criteria: [] });
    expect(second.ok).toBe(false);

    await runtime.stop(goal.id);
    expect((await runtime.start({ sessionPath: SESSION, objective: 'another', criteria: [] })).ok).toBe(true);
  });
});

describe('holding the session only while it is driving', () => {
  /**
   * The claim exists so two autonomous drivers cannot steer one session. A goal
   * that is paused, waiting or out of budget steers nothing, so keeping the
   * claim would refuse a Workflow step for no reason.
   */
  it('gives the session back when the goal pauses, and takes it again on resume', async () => {
    const { drivers, runtime } = createRuntime();
    const goal = await startGoal(runtime);
    expect(drivers.holderOf('sess-1')).toEqual({ kind: 'goal', ownerId: goal.id });

    await runtime.pause(goal.id, 'user', 'the user paused the goal');
    expect(drivers.holderOf('sess-1')).toBeUndefined();

    await runtime.resume(goal.id);
    expect(drivers.holderOf('sess-1')).toEqual({ kind: 'goal', ownerId: goal.id });
  });

  it('gives the session back when a budget stops the goal', async () => {
    const { drivers, runtime } = createRuntime();
    const goal = await startGoal(runtime, { maxAttemptsTotal: 1 });

    const verdict = await runtime.checkContinue(turn(goal.id));

    expect(verdict.kind).toBe('limited');
    expect(drivers.holderOf('sess-1')).toBeUndefined();
  });

  it('gives the session back when the goal parks itself', async () => {
    const { drivers, runtime } = createRuntime();
    const goal = await startGoal(runtime);

    await runtime.reportWait(goal.id, SESSION, 'the release build is still running');

    expect(drivers.holderOf('sess-1')).toBeUndefined();
    const waiting = await runtime.forSession(SESSION);
    expect(waiting?.status).toBe('waiting');
  });

  it('refuses to resume when something else took the session meanwhile', async () => {
    const { drivers, runtime } = createRuntime();
    const goal = await startGoal(runtime);
    await runtime.pause(goal.id, 'user', 'the user paused the goal');
    drivers.claim('sess-1', { kind: 'workflow-step', ownerId: 'loop-9' });

    const resumed = await runtime.resume(goal.id);

    expect(resumed.ok).toBe(false);
    expect((await runtime.forSession(SESSION))?.status).toBe('paused');
  });
});

describe('restoring a goal into a session', () => {
  it('holds an active goal that cannot re-take its session', async () => {
    const io = memoryIo();
    const goal = await startGoal(createRuntime(createFakeHost(), io).runtime);
    // Sero restarts: the records survive, the in-process claims do not.
    const { drivers, runtime } = createRuntime(createFakeHost(), io);
    await runtime.reconcile();
    // A Workflow step got the session first.
    drivers.claim('sess-1', { kind: 'workflow-step', ownerId: 'loop-9' });

    const restored = await runtime.reattach(SESSION);

    // The caller drives from the status, so a lost claim must change it.
    expect(restored?.status).toBe('paused');
    expect(restored?.pauseReason).toBe('restore');
    expect(drivers.holderOf('sess-1')).toEqual({ kind: 'workflow-step', ownerId: 'loop-9' });
    expect(restored?.id).toBe(goal.id);
  });

  it('takes the session back when nothing else holds it', async () => {
    const io = memoryIo();
    const goal = await startGoal(createRuntime(createFakeHost(), io).runtime);
    const { drivers, runtime } = createRuntime(createFakeHost(), io);
    await runtime.reconcile();

    const restored = await runtime.reattach(SESSION);

    expect(restored?.status).toBe('active');
    expect(drivers.holderOf('sess-1')).toEqual({ kind: 'goal', ownerId: goal.id });
  });
});

describe('charging a turn a terminal tool already ended', () => {
  it('charges the goal without moving it off the state its tool chose', async () => {
    const { runtime } = createRuntime();
    const goal = await startGoal(runtime);
    await runtime.reportWait(goal.id, SESSION, 'the release build is still running');

    const charged = await runtime.recordSettledTurn(turn(goal.id, { totalTokens: 400, costUsd: 0.04 }));

    expect(charged?.status).toBe('waiting');
    expect(charged?.usage.automaticTurns).toBe(1);
    expect(charged?.usage.totalTokens).toBe(400);
  });

  it('refuses a turn reported from a session that does not own the goal', async () => {
    const { runtime } = createRuntime();
    const goal = await startGoal(runtime);

    const charged = await runtime.recordSettledTurn(turn(goal.id, { sessionPath: '/sessions/chat-2.jsonl' }));

    expect(charged).toBeNull();
    expect((await runtime.forSession(SESSION))?.usage.automaticTurns).toBe(0);
  });
});
