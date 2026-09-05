import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  USER_FEEDBACK_QUESTION_REQUEST_EVENT,
  USER_FEEDBACK_QUESTION_CANCEL_EVENT,
  getUserFeedbackAnswerEvent,
} from '@sero-ai/common';
import { getUserFeedbackBus } from '@electron/shared/lib/user-feedback-bus';
import {
  answerChoice,
  pendingChoicesFor,
  registerGatewayChoiceBridge,
  resetChoiceBridge,
} from '@electron/features/gateway/bridge/choice-bridge';
import {
  forwardEventToGateway,
  installGatewayAgentOps,
  resetSessionActivity,
  setGatewayEventSink,
} from '@electron/features/gateway/bridge/agent-bridge';
import type { GatewayAgentOps } from '@electron/features/gateway/server/types';
import type { GatewayPushEvent } from '@electron/features/gateway/server/protocol-events';
import type { UserFeedbackPendingQuestion, UserFeedbackResponse } from '@/types/ipc';

const workspaceEvents: Array<{ workspaceId: string; event: GatewayPushEvent }> = [];
const ownerEvents: GatewayPushEvent[] = [];

const sink = {
  broadcastWorkspaceEvent: (workspaceId: string, event: GatewayPushEvent) => {
    workspaceEvents.push({ workspaceId, event });
  },
  broadcastOwnerEvent: (event: GatewayPushEvent) => {
    ownerEvents.push(event);
  },
};

/** A single-question choice, the shape `requestChoice` emits. */
function question(
  id: string,
  options: { workspaceId?: string; optionIds?: string[]; count?: number } = {},
): UserFeedbackPendingQuestion {
  const optionIds = options.optionIds ?? ['worktree', 'in-place'];
  const item = {
    id: 'q0',
    label: 'Workspace has changes',
    prompt: 'Where should this run?',
    options: optionIds.map((value) => ({ value, label: value })),
    allowOther: false,
  };
  return {
    id,
    type: 'question',
    toolCallId: 'orchestrator-choice',
    questions: Array.from({ length: options.count ?? 1 }, () => item),
    timestamp: new Date().toISOString(),
    context: options.workspaceId ? { workspaceId: options.workspaceId } : undefined,
  };
}

/** Everything a token can reach. */
const owner = () => true;
/** Only `ws-1`, as a scoped token. */
const scoped = (workspaceId: string | null) => workspaceId === 'ws-1';

beforeEach(() => {
  workspaceEvents.length = 0;
  ownerEvents.length = 0;
  registerGatewayChoiceBridge(sink);
});

afterEach(() => {
  resetChoiceBridge();
});

describe('choice fan-out', () => {
  it('sends a workspace choice to the tokens that reach the workspace', () => {
    getUserFeedbackBus().emit(
      USER_FEEDBACK_QUESTION_REQUEST_EVENT,
      question('c1', { workspaceId: 'ws-1' }),
    );

    expect(workspaceEvents).toHaveLength(1);
    expect(workspaceEvents[0]?.workspaceId).toBe('ws-1');
    expect(workspaceEvents[0]?.event.type).toBe('choice_request');
    expect(ownerEvents).toHaveLength(0);
  });

  it('sends a choice with no workspace to owner tokens only', () => {
    getUserFeedbackBus().emit(USER_FEEDBACK_QUESTION_REQUEST_EVENT, question('c1'));

    expect(ownerEvents).toHaveLength(1);
    expect(workspaceEvents).toHaveLength(0);
  });

  it('ignores a multi-question interview, which needs a form', () => {
    getUserFeedbackBus().emit(
      USER_FEEDBACK_QUESTION_REQUEST_EVENT,
      question('c1', { count: 2 }),
    );

    expect(ownerEvents).toHaveLength(0);
    expect(pendingChoicesFor(owner)).toEqual([]);
  });

  it('lists a pending choice for a client that connects later', () => {
    getUserFeedbackBus().emit(
      USER_FEEDBACK_QUESTION_REQUEST_EVENT,
      question('c1', { workspaceId: 'ws-1' }),
    );

    expect(pendingChoicesFor(owner).map((choice) => choice.id)).toEqual(['c1']);
  });

  it('hides an out-of-scope choice from a scoped token', () => {
    getUserFeedbackBus().emit(
      USER_FEEDBACK_QUESTION_REQUEST_EVENT,
      question('c1', { workspaceId: 'ws-2' }),
    );

    expect(pendingChoicesFor(scoped)).toEqual([]);
  });
});

describe('answering a choice', () => {
  it('resolves the waiting caller with the chosen option', () => {
    const answers: UserFeedbackResponse[] = [];
    getUserFeedbackBus().once(getUserFeedbackAnswerEvent('c1'), (response: UserFeedbackResponse) => {
      answers.push(response);
    });
    getUserFeedbackBus().emit(
      USER_FEEDBACK_QUESTION_REQUEST_EVENT,
      question('c1', { workspaceId: 'ws-1' }),
    );

    expect(answerChoice('c1', 'worktree', owner)).toEqual({ ok: true });
    expect(answers).toHaveLength(1);
    expect(answers[0]?.cancelled).toBe(false);
    expect(answers[0]?.answers[0]).toMatchObject({ questionId: 'q0', value: 'worktree' });
  });

  it('tells every client the choice is over', () => {
    getUserFeedbackBus().emit(
      USER_FEEDBACK_QUESTION_REQUEST_EVENT,
      question('c1', { workspaceId: 'ws-1' }),
    );
    answerChoice('c1', 'worktree', owner);

    const resolved = workspaceEvents.map((entry) => entry.event).filter((event) => event.type === 'choice_resolved');
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ id: 'c1', outcome: 'answered', optionId: 'worktree' });
  });

  it('refuses a second answer once the choice is over', () => {
    getUserFeedbackBus().emit(USER_FEEDBACK_QUESTION_REQUEST_EVENT, question('c1'));
    answerChoice('c1', 'worktree', owner);

    expect(answerChoice('c1', 'in-place', owner)).toEqual({ ok: false, reason: 'unknown' });
  });

  it('refuses an answer from a token that cannot reach the workspace', () => {
    getUserFeedbackBus().emit(
      USER_FEEDBACK_QUESTION_REQUEST_EVENT,
      question('c1', { workspaceId: 'ws-2' }),
    );

    expect(answerChoice('c1', 'worktree', scoped)).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('refuses a scoped token on a choice with no workspace', () => {
    getUserFeedbackBus().emit(USER_FEEDBACK_QUESTION_REQUEST_EVENT, question('c1'));

    expect(answerChoice('c1', 'worktree', scoped)).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('refuses an option the choice does not offer', () => {
    getUserFeedbackBus().emit(USER_FEEDBACK_QUESTION_REQUEST_EVENT, question('c1'));

    expect(answerChoice('c1', 'made-up', owner)).toEqual({ ok: false, reason: 'invalid_option' });
  });

  it('refuses a choice that never existed', () => {
    expect(answerChoice('nope', 'worktree', owner)).toEqual({ ok: false, reason: 'unknown' });
  });
});

describe('choices resolved elsewhere', () => {
  it('dismisses the card when the desktop answers first', () => {
    getUserFeedbackBus().emit(
      USER_FEEDBACK_QUESTION_REQUEST_EVENT,
      question('c1', { workspaceId: 'ws-1' }),
    );

    // What the desktop main process emits when the window answers.
    getUserFeedbackBus().emit(getUserFeedbackAnswerEvent('c1'), {
      id: 'c1',
      answers: [{ questionId: 'q0', value: 'in-place', label: 'in-place', wasCustom: false }],
      cancelled: false,
    } satisfies UserFeedbackResponse);

    expect(pendingChoicesFor(owner)).toEqual([]);
    const resolved = workspaceEvents.map((entry) => entry.event).filter((event) => event.type === 'choice_resolved');
    expect(resolved[0]).toMatchObject({ outcome: 'answered', optionId: 'in-place' });
  });

  it('dismisses the card when the choice times out', () => {
    getUserFeedbackBus().emit(
      USER_FEEDBACK_QUESTION_REQUEST_EVENT,
      question('c1', { workspaceId: 'ws-1' }),
    );

    // What `requestChoice` emits when its timer expires.
    getUserFeedbackBus().emit(USER_FEEDBACK_QUESTION_CANCEL_EVENT, { id: 'c1' });

    expect(pendingChoicesFor(owner)).toEqual([]);
    const resolved = workspaceEvents.map((entry) => entry.event).filter((event) => event.type === 'choice_resolved');
    expect(resolved[0]).toMatchObject({ outcome: 'cancelled' });
    expect(resolved[0] as { optionId?: string }).not.toHaveProperty('optionId', 'worktree');
  });

  it('says nothing about a question it never forwarded', () => {
    getUserFeedbackBus().emit(USER_FEEDBACK_QUESTION_CANCEL_EVENT, { id: 'never-seen' });

    expect(workspaceEvents).toEqual([]);
    expect(ownerEvents).toEqual([]);
  });

  it('stops listening once a choice is over, so a late answer says nothing', () => {
    getUserFeedbackBus().emit(
      USER_FEEDBACK_QUESTION_REQUEST_EVENT,
      question('c1', { workspaceId: 'ws-1' }),
    );
    answerChoice('c1', 'worktree', owner);
    const afterFirst = workspaceEvents.length;

    getUserFeedbackBus().emit(getUserFeedbackAnswerEvent('c1'), {
      id: 'c1',
      answers: [{ questionId: 'q0', value: 'in-place', label: 'in-place', wasCustom: false }],
      cancelled: false,
    } satisfies UserFeedbackResponse);

    expect(workspaceEvents).toHaveLength(afterFirst);
  });
});

describe('the session behind a question', () => {
  /** Every session-state event the agent bridge broadcast, in order. */
  const states: Array<{ sessionId: unknown; state: unknown }> = [];

  beforeEach(() => {
    states.length = 0;
    resetSessionActivity();
    setGatewayEventSink({
      pushEvent: () => {},
      broadcastWorkspaceEvent: (_workspaceId, event) => {
        if (event.type === 'session_state') states.push({ sessionId: event.sessionId, state: event.state });
      },
    });
    installGatewayAgentOps({ getSessionWorkspaceId: () => 'ws-1' } as unknown as GatewayAgentOps);
    forwardEventToGateway({ type: 'agent_start', sessionId: 's1' });
    forwardEventToGateway({ type: 'tool_start', sessionId: 's1', tool: { toolCallId: 'call-1', toolName: 'question' } });
    states.length = 0;
  });

  afterEach(() => {
    resetSessionActivity();
    setGatewayEventSink({ pushEvent: () => {}, broadcastWorkspaceEvent: () => {} });
    installGatewayAgentOps({ getSessionWorkspaceId: () => null } as unknown as GatewayAgentOps);
  });

  /** A question raised by the tool call the bridge saw start. */
  function fromTool(id: string, count = 1): UserFeedbackPendingQuestion {
    return { ...question(id, { workspaceId: 'ws-1', count }), toolCallId: 'call-1' };
  }

  it('is reported as waiting when the question appears, and running once it is answered', () => {
    getUserFeedbackBus().emit(USER_FEEDBACK_QUESTION_REQUEST_EVENT, fromTool('c1'));
    expect(states).toEqual([{ sessionId: 's1', state: 'awaiting_input' }]);

    answerChoice('c1', 'worktree', owner);
    expect(states).toEqual([
      { sessionId: 's1', state: 'awaiting_input' },
      { sessionId: 's1', state: 'running' },
    ]);
  });

  it('is reported as waiting for a form the phone cannot answer', () => {
    getUserFeedbackBus().emit(USER_FEEDBACK_QUESTION_REQUEST_EVENT, fromTool('c1', 3));
    expect(states).toEqual([{ sessionId: 's1', state: 'awaiting_input' }]);

    getUserFeedbackBus().emit(USER_FEEDBACK_QUESTION_CANCEL_EVENT, { id: 'c1' });
    expect(states[1]).toEqual({ sessionId: 's1', state: 'running' });
  });

  it('stays idle when the turn ended before the question was cancelled', () => {
    getUserFeedbackBus().emit(USER_FEEDBACK_QUESTION_REQUEST_EVENT, fromTool('c1'));
    forwardEventToGateway({ type: 'agent_end', sessionId: 's1' });
    getUserFeedbackBus().emit(USER_FEEDBACK_QUESTION_CANCEL_EVENT, { id: 'c1' });

    expect(states.map((entry) => entry.state)).toEqual(['awaiting_input', 'idle']);
  });

  it('says nothing about a question no session raised', () => {
    getUserFeedbackBus().emit(
      USER_FEEDBACK_QUESTION_REQUEST_EVENT,
      question('c1', { workspaceId: 'ws-1' }),
    );

    expect(states).toEqual([]);
  });
});
