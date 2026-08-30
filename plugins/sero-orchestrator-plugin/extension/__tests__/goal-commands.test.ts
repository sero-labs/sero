/**
 * The `/goal` command parser and the one rule the goal tool holds itself:
 * a session that cannot call the terminal tools cannot start a goal, because a
 * goal with no way to stop is worse than no goal (D07).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { Coordinator } from '../../runtime/coordinator';
import { GoalRuntime } from '../../runtime/goals/goal-runtime';
import { createGoalStore } from '../../runtime/goals/goal-store';
import { registerCoordinator, registerGoalRuntime } from '../../runtime/registry';
import { SessionDrivers } from '../../runtime/session-drivers';
import { createFakeHost } from '../../runtime/__tests__/fake-host';
import { executeGoalTool, parseCriteria, parseGoalCommand, parseLimits } from '../goal-commands';

const context = {
  cwd: '/work/repo',
  sessionManager: { getSessionFile: () => '/sessions/chat-1.jsonl' },
} as Pick<ExtensionContext, 'cwd' | 'sessionManager'> as ExtensionContext;

const TOOLS = () => ['goal_complete', 'goal_blocked', 'goal_wait'];

let runtime: GoalRuntime;

beforeEach(() => {
  const host = createFakeHost({ workspacePath: '/work/repo' });
  // Two conversations, no host session id to arbitrate: exactly the case where
  // only the session path can tell the goals apart.
  host.activeSession = null;
  const files = new Map<string, unknown>();
  runtime = new GoalRuntime(
    host,
    createGoalStore(
      {
        read: async <T,>(file: string) => (files.get(file) as T) ?? null,
        write: async <T,>(file: string, data: T) => {
          files.set(file, data);
        },
      },
      '/state',
    ),
    new SessionDrivers(),
  );
  registerCoordinator(host.workspaceId, '/work/repo', new Coordinator(host));
  registerGoalRuntime(host.workspaceId, runtime);
});

describe('parsing /goal', () => {
  it('treats free text as the objective', () => {
    expect(parseGoalCommand('get the release build green')).toEqual({
      action: 'start',
      objective: 'get the release build green',
      criteria: undefined,
    });
  });

  it('splits criteria off the objective', () => {
    expect(parseGoalCommand('ship the fix -- tests pass; lint passes')).toEqual({
      action: 'start',
      objective: 'ship the fix',
      criteria: 'tests pass; lint passes',
    });
    expect(parseCriteria('tests pass; lint passes')).toEqual(['tests pass', 'lint passes']);
  });

  it('recognises the control words', () => {
    expect(parseGoalCommand('pause')).toEqual({ action: 'pause', goalId: undefined });
    expect(parseGoalCommand('status')).toEqual({ action: 'status', goalId: undefined });
    expect(parseGoalCommand('turns 40')).toEqual({ action: 'set_limits', maxTurns: 40 });
  });

  it('refuses a turn budget that is not a whole number', () => {
    expect(parseGoalCommand('turns many')).toEqual({
      error: 'turns needs a whole number, for example /goal turns 40',
    });
  });

  it('shows help for an empty command', () => {
    const parsed = parseGoalCommand('  ');
    expect('error' in parsed && parsed.error).toContain('/goal <objective>');
  });
});

describe('budgets from the tool parameters', () => {
  it('maps minutes to milliseconds and turns to the shared attempt limit', () => {
    expect(parseLimits({ action: 'start', maxTurns: 10, maxMinutes: 30, maxCostUsd: 2 })).toEqual({
      maxAttemptsTotal: 10,
      maxWallClockMs: 1_800_000,
      maxCostUsd: 2,
    });
  });
});

describe('starting a goal', () => {
  it('refuses when a tool policy hides a terminal tool', async () => {
    const result = await executeGoalTool({ action: 'start', objective: 'do it' }, context, () => [
      'goal_complete',
      'goal_wait',
    ]);

    expect(result.details.ok).toBe(false);
    expect(result.text).toContain('goal_blocked');
    expect(result.text).toContain('grants no extra tools');
  });
});

describe('who may control a goal', () => {
  /**
   * The `goal` tool is model-callable and the runtime addresses goals by id.
   * A conversation must not be able to reach past its own goal into another
   * one, whichever id it names.
   */
  it('refuses an id that belongs to another session', async () => {
    const other = await runtime.start({ sessionPath: '/sessions/chat-2.jsonl', objective: 'other work', criteria: [] });
    await runtime.start({ sessionPath: '/sessions/chat-1.jsonl', objective: 'my work', criteria: [] });

    const result = await executeGoalTool({ action: 'stop', goalId: other.goal!.id }, context, TOOLS);

    expect(result.details.ok).toBe(false);
    expect(result.text).toContain('does not belong to this session');
    const untouched = (await runtime.list()).find((goal) => goal.id === other.goal!.id);
    expect(untouched?.status).toBe('active');
    expect(untouched?.closedAt).toBeUndefined();
  });

  it('acts on the calling session\'s own goal when no id is given', async () => {
    const mine = await runtime.start({ sessionPath: '/sessions/chat-1.jsonl', objective: 'my work', criteria: [] });

    const result = await executeGoalTool({ action: 'pause' }, context, TOOLS);

    expect(result.details.ok).toBe(true);
    expect((await runtime.forSession('/sessions/chat-1.jsonl'))?.id).toBe(mine.goal!.id);
    expect((await runtime.forSession('/sessions/chat-1.jsonl'))?.status).toBe('paused');
  });
});
