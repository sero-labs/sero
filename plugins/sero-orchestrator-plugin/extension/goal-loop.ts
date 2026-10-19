/**
 * The in-session goal loop (D01: the extension drives, the runtime supervises).
 *
 * It continues from the SETTLED boundary, not from turn end. `agent_settled`
 * fires once, after queued work, provider retries and compaction have finished;
 * `turn_end` fires inside the tool loop and would start overlapping
 * continuations.
 *
 * A goal only runs if something starts the first turn. A slash command, a
 * resume and a restored session all leave the agent idle, so `registerGoalLoop`
 * returns the starter those surfaces call — and the turn it starts is charged
 * to the goal, exactly like a continuation.
 *
 * Four rules decide whether a continuation is sent at all:
 *   - a pending user message cancels it. The user always wins.
 *   - an aborted turn pauses the goal. Escape means stop, not retry.
 *   - the runtime, not this file, decides limits and no-progress holds.
 *   - the goal must still be active when the boundary is reached.
 *
 * None of them is a reason to charge nothing. A turn the goal started is spent
 * whether it is cancelled, overtaken by the user, continued, or ended by a
 * terminal tool call inside it, so the turn is reported to the runtime BEFORE
 * any of these rules decides against another.
 */

import { createHash } from 'node:crypto';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  buildGoalContinuation,
  buildGoalContract,
  GOAL_CONTINUATION_MESSAGE_TYPE,
  GOAL_CONTRACT_MESSAGE_TYPE,
  GOAL_STATUS_MESSAGE_TYPE,
} from '../shared/goal-contract';
import type { Goal, GoalVerdict } from '../shared/goal-types';
import { normalizeTurnText } from '../shared/goal-fingerprint';
import { reservedWakes } from '../shared/goal-waits';
import { onGoalWake } from '../runtime/goals/goal-wake';
import { resolveGoalCaller, type GoalCaller } from './goal-session';
import { hiddenTerminalTools, type TerminalToolSwitch } from './goal-terminal-switch';

/**
 * Starts a turn for a goal that is active but idle. `registerGoalLoop` owns the
 * accounting flag, so only it can hand this out.
 */
export type GoalTurnStarter = (goal: Goal) => void;

/** What the settled turn produced, gathered as the turn runs. */
interface TurnRecord {
  text: string;
  toolAttempted: boolean;
  totalTokens: number;
  costUsd: number;
  aborted: boolean;
}

function emptyTurn(): TurnRecord {
  return { text: '', toolAttempted: false, totalTokens: 0, costUsd: 0, aborted: false };
}

/**
 * Visible assistant text only. Thinking is excluded because reasoning
 * differently while producing the same answer is not progress, and tool calls
 * are excluded because an attempted tool already resets the ledger on its own.
 */
export function summarizeTurn(messages: AgentMessage[]): TurnRecord {
  const record = emptyTurn();
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const part of message.content) {
      if (part.type === 'text') record.text += part.text;
      if (part.type === 'toolCall') record.toolAttempted = true;
    }
    record.totalTokens += message.usage.totalTokens;
    record.costUsd += message.usage.cost.total;
    record.aborted = message.stopReason === 'aborted';
  }
  return record;
}

export function fingerprintTurn(text: string): string {
  return createHash('sha256').update(normalizeTurnText(text)).digest('hex');
}

/** Sends the contract, which supersedes every earlier one in this conversation. */
export function assertGoalContract(pi: ExtensionAPI, goal: Goal): void {
  pi.sendMessage(
    { customType: GOAL_CONTRACT_MESSAGE_TYPE, content: buildGoalContract(goal), display: false, details: { goal } },
    { triggerTurn: false },
  );
}

/** One line about what the goal just did, for the transcript and the banner. */
function announce(pi: ExtensionAPI, goal: Goal, text: string): void {
  pi.sendMessage(
    { customType: GOAL_STATUS_MESSAGE_TYPE, content: text, display: true, details: { goal } },
    { triggerTurn: false },
  );
}

function verdictText(verdict: Exclude<GoalVerdict, { kind: 'continue' }>): string {
  switch (verdict.kind) {
    case 'hold-no-progress':
      return `Goal paused — ${verdict.reason}. Resume it with /goal resume.`;
    case 'limited':
      return `Goal stopped at a limit — it ${verdict.reason}. This is not completion. Raise the limit, then resume.`;
    case 'waiting':
      return `Goal is waiting — ${verdict.reason}.`;
    case 'inactive':
      return `Goal is no longer driving this session — ${verdict.reason}.`;
  }
}

export function registerGoalLoop(pi: ExtensionAPI, terminalTools: TerminalToolSwitch): GoalTurnStarter {
  let turn = emptyTurn();
  let boundaryOpen = false;
  // True while the turn now starting is one this loop asked for. Only such
  // turns are charged to the goal budget.
  let continuationQueued = false;
  let automatic = false;
  // The goal this loop asked the turn for. A terminal tool can end that goal
  // while its turn is still running, so the turn's owner cannot be looked up
  // again at the settled boundary — it is remembered from when it was asked for.
  let queuedGoalId: string | null = null;
  let turnGoalId: string | null = null;
  let lastCaller: GoalCaller | null = null;
  // One continuation per completed turn. While the settled handler is still
  // reading and writing, a wake that lands waits for it instead of starting a
  // second turn beside the one the handler may be about to start.
  let settling = false;
  let startedWhileSettling = false;
  let deferredWake: Goal | null = null;
  const takeDeferredWake = (): Goal | null => {
    const taken = deferredWake;
    deferredWake = null;
    return taken;
  };

  const rememberCaller = (ctx: ExtensionContext): GoalCaller | null => {
    const caller = resolveGoalCaller(ctx);
    if ('error' in caller) return null;
    lastCaller = caller;
    return caller;
  };

  /** Drives one turn for the goal, and books it to the goal's budget. */
  const startTurn: GoalTurnStarter = (goal) => {
    terminalTools.set(true);
    // A wait that woke this goal is consumed as its turn starts, whichever path
    // started it: the wake, the settled boundary, or a restored session.
    if (reservedWakes(goal).length > 0) void lastCaller?.runtime.consumeWakes(goal.id);
    startedWhileSettling = true;
    continuationQueued = true;
    queuedGoalId = goal.id;
    pi.sendMessage(
      {
        customType: GOAL_CONTINUATION_MESSAGE_TYPE,
        content: buildGoalContinuation(goal),
        display: true,
        details: {
          goalId: goal.id,
          automaticTurns: goal.usage.automaticTurns,
          maxAutomaticTurns: goal.limits.maxAttemptsTotal,
        },
      },
      { triggerTurn: true },
    );
  };

  pi.on('before_agent_start', (event) => {
    // A real user prompt is never a goal continuation, whatever was queued.
    if (event.prompt.trim().length > 0) {
      continuationQueued = false;
      queuedGoalId = null;
    }
  });

  pi.on('agent_start', (_event, ctx) => {
    // Pi may start the agent more than once before one settled boundary after
    // provider retries, compaction, or queued messages. Those sub-runs are one
    // Goal turn, so ownership and usage stay open until agent_settled.
    if (!boundaryOpen) {
      boundaryOpen = true;
      automatic = continuationQueued;
      turnGoalId = automatic ? queuedGoalId : null;
      turn = emptyTurn();
    }
    continuationQueued = false;
    queuedGoalId = null;
    rememberCaller(ctx);
  });

  // The event fires before the tool runs, so a refused or failed tool call
  // still counts as an attempt — which is the point: the agent tried something.
  pi.on('tool_execution_start', () => {
    turn.toolAttempted = true;
  });

  pi.on('agent_end', (event) => {
    const summary = summarizeTurn(event.messages);
    turn = {
      text: turn.text + summary.text,
      toolAttempted: turn.toolAttempted || summary.toolAttempted,
      totalTokens: turn.totalTokens + summary.totalTokens,
      costUsd: turn.costUsd + summary.costUsd,
      aborted: turn.aborted || summary.aborted,
    };
  });

  // Compaction rewrites the conversation, so the hidden contract may be gone and
  // a continuation must not point back at a contract that no longer exists.
  pi.on('session_compact', async (_event, ctx) => {
    const caller = rememberCaller(ctx);
    if (!caller) return;
    const goal = await caller.runtime.forSession(caller.sessionPath);
    if (goal) assertGoalContract(pi, goal);
  });

  pi.on('session_start', async (_event, ctx) => {
    terminalTools.claim();
    const caller = rememberCaller(ctx);
    if (!caller) return;
    // A registered wait wakes a goal through this loop and no other driver.
    // While a turn is open, the settled boundary continues the now-active goal.
    onGoalWake(caller.sessionPath, (woken) => {
      if (settling) {
        deferredWake = woken;
        return;
      }
      if (boundaryOpen) return;
      terminalTools.set(true);
      assertGoalContract(pi, woken);
      startTurn(woken);
    });
    const goal = await caller.runtime.reattach(caller.sessionPath);
    if (!goal) return;
    terminalTools.set(goal.status === 'active');
    const hidden = hiddenTerminalTools(pi.getActiveTools());
    if (hidden.length > 0 && goal.status === 'active') {
      const paused = await caller.runtime.pause(
        goal.id,
        'tool-policy',
        `this session cannot call ${hidden.join(', ')}, so the goal could not be stopped`,
      );
      if (paused.goal) assertGoalContract(pi, paused.goal);
      return;
    }
    assertGoalContract(pi, goal);
    // A restored goal that is still active and still inside its budget has no
    // settled boundary to continue from: this is its first turn again.
    if (goal.status === 'active') startTurn(goal);
  });

  pi.on('agent_settled', async (event, ctx: ExtensionContext) => {
    settling = true;
    startedWhileSettling = false;
    deferredWake = null;
    try {
      await settle(event, ctx);
    } finally {
      settling = false;
    }
    // A wake that landed mid-settle is started now, once, unless this boundary
    // already started the turn, a message is queued, or the goal has moved on.
    const wake = takeDeferredWake();
    if (!wake || startedWhileSettling || boundaryOpen || ctx.hasPendingMessages()) return;
    const caller = lastCaller;
    const current = caller ? await caller.runtime.forSession(caller.sessionPath) : null;
    if (!current || current.id !== wake.id || current.status !== 'active' || boundaryOpen || settling) return;
    terminalTools.set(true);
    assertGoalContract(pi, current);
    startTurn(current);
  });

  const settle = async (_event: unknown, ctx: ExtensionContext): Promise<void> => {
    const settledTurn = turn;
    const settledAutomatic = automatic;
    const settledGoalId = turnGoalId;
    boundaryOpen = false;
    automatic = false;
    turnGoalId = null;
    turn = emptyTurn();

    const caller = rememberCaller(ctx);
    if (!caller) {
      const fallback = lastCaller;
      if (!fallback) return;
      const goal = await fallback.runtime.forSession(fallback.sessionPath);
      terminalTools.set(goal?.status === 'active');
      if (!goal || goal.status !== 'active' || (settledGoalId && goal.id !== settledGoalId)) return;
      await fallback.runtime.recordSettledTurn({
        goalId: settledGoalId ?? goal.id,
        sessionPath: fallback.sessionPath,
        fingerprint: fingerprintTurn(settledTurn.text),
        toolAttempted: settledTurn.toolAttempted,
        automatic: settledAutomatic,
        totalTokens: settledTurn.totalTokens,
        costUsd: settledTurn.costUsd,
      });
      const paused = await fallback.runtime.pause(
        goal.id,
        'restore',
        'the Goal runtime became unavailable at the settled boundary',
      );
      terminalTools.set(false);
      if (paused.goal) {
        assertGoalContract(pi, paused.goal);
        announce(pi, paused.goal, 'Goal paused because its runtime became unavailable. Reopen the workspace, then resume it.');
      }
      return;
    }
    const goal = await caller.runtime.forSession(caller.sessionPath);
    // A terminal tool inside the turn may have completed, blocked or parked the
    // goal, and the tools go with it.
    terminalTools.set(goal?.status === 'active');
    // The goal that owned this turn, which is not always the live one: a
    // terminal tool inside the turn can have completed, blocked, parked,
    // paused or stopped it before it settled.
    const ownerId = settledGoalId ?? goal?.id;
    if (!ownerId) return;

    const report = {
      goalId: ownerId,
      sessionPath: caller.sessionPath,
      fingerprint: fingerprintTurn(settledTurn.text),
      toolAttempted: settledTurn.toolAttempted,
      automatic: settledAutomatic,
      totalTokens: settledTurn.totalTokens,
      costUsd: settledTurn.costUsd,
    };

    // The turn ran, so it is charged — but only a live, active goal that still
    // owns this session may be moved by what the turn produced.
    if (!goal || goal.id !== ownerId || goal.status !== 'active') {
      const charged = await caller.runtime.recordSettledTurn(report);
      // A terminal tool changes the status before the turn settles. Re-state
      // the charged record so the session banner receives the final usage too.
      if (charged) assertGoalContract(pi, charged);
      return;
    }

    // Report the turn first. It is charged only if the goal started it, and it
    // is charged whether or not anything below allows another one.
    const verdict = await caller.runtime.checkContinue(report);

    // A budget or a no-progress hold outranks the two rules below: the goal has
    // already left `active`, with a reason worth more than "paused".
    if (verdict.kind !== 'continue') {
      // The goal has left `active`, so the terminal tools go with it.
      terminalTools.set(false);
      if (verdict.goal) {
        assertGoalContract(pi, verdict.goal);
        announce(pi, verdict.goal, verdictText(verdict));
      }
      return;
    }

    if (settledTurn.aborted) {
      // Escape or cancel. Pause immediately and never poke a paused goal.
      const paused = await caller.runtime.pause(goal.id, 'abort', 'the turn was cancelled');
      terminalTools.set(false);
      if (paused.goal) {
        assertGoalContract(pi, paused.goal);
        announce(pi, paused.goal, 'Goal paused because the turn was cancelled. Resume it with /goal resume.');
      }
      return;
    }

    // A terminal tool the user turned off mid-goal leaves a goal that could not be stopped.
    const hidden = hiddenTerminalTools(terminalTools.reachableTools());
    if (hidden.length > 0) {
      const paused = await caller.runtime.pause(
        goal.id,
        'tool-policy',
        `this session cannot call ${hidden.join(', ')}, so the goal could not be stopped`,
      );
      terminalTools.set(false);
      if (paused.goal) {
        assertGoalContract(pi, paused.goal);
        announce(pi, paused.goal, `Goal paused because this session can no longer call ${hidden.join(', ')}. Turn the tool back on, then resume it with /goal resume.`);
      }
      return;
    }

    // A queued user message cancels the continuation rather than racing it. The
    // user's turn drives the session next, and the goal picks up when it settles.
    if (ctx.hasPendingMessages()) return;

    startTurn(verdict.goal);
  };

  return startTurn;
}
