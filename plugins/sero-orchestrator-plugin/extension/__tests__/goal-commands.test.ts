/**
 * The `/goal` command parser and the one rule the goal tool holds itself:
 * a session that cannot call the terminal tools cannot start a goal, because a
 * goal with no way to stop is worse than no goal (D07).
 */

import { describe, expect, it } from 'vitest';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { executeGoalTool, parseCriteria, parseGoalCommand, parseLimits } from '../goal-commands';

const context = {
  cwd: '/work/repo',
  sessionManager: { getSessionFile: () => '/sessions/chat-1.jsonl' },
} as Pick<ExtensionContext, 'cwd' | 'sessionManager'> as ExtensionContext;

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
