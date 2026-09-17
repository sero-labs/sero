/**
 * The turn contract of a persistent session.
 *
 * A caller prompts a session, is given a turn id, and waits for the turn to
 * end. Pi's own events carry no turn identity — `agent_start` has no fields at
 * all and `agent_end` only the messages — so the host stamps the id it issued
 * onto the events of that run. Get this wrong and every caller waits for a turn
 * boundary that never arrives, which is exactly how Agent Rooms deadlocked on
 * the first turn of every member.
 */

import { describe, expect, it, vi } from 'vitest';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { PersistentSessionEvent } from '@sero-ai/common';

import { LiveSessionRegistry } from '@electron/features/apps/runtime/capabilities/persistent-sessions/live-sessions';

/** A session that emits exactly what the test tells it to. */
function fakeSession(): { session: AgentSession; emit: (event: unknown) => void } {
  const listeners: ((event: unknown) => void)[] = [];
  const session = {
    // The model the session actually runs with, so a request record names it
    // rather than a tier label.
    model: { id: 'claude-test', provider: 'anthropic' },
    subscribe: (cb: (event: unknown) => void) => {
      listeners.push(cb);
      return () => listeners.splice(listeners.indexOf(cb), 1);
    },
  } as unknown as AgentSession;
  return { session, emit: (event) => listeners.forEach((cb) => cb(event)) };
}

function registryWithSession() {
  const registry = new LiveSessionRegistry();
  const { session, emit } = fakeSession();
  registry.add({
    handleId: 'psh_1',
    grantId: 'grant_1',
    subject: 'conductor',
    sessionId: 'session-1',
    sessionPath: '/sessions/grant_1/session-1.jsonl',
    session,
  });
  const seen: PersistentSessionEvent[] = [];
  registry.watch('psh_1', (event) => seen.push(event));
  return { registry, emit, seen };
}

describe('LiveSessionRegistry turn identity', () => {
  it('reports the final provider error with its reason and does not retain an earlier failed attempt', () => {
    const { registry, emit, seen } = registryWithSession();
    const failed = { role: 'assistant', stopReason: 'error', errorMessage: 'Your credit balance is too low to access the Anthropic API.' };
    registry.beginTurn('psh_1', 'failed-turn');
    emit({ type: 'agent_end', messages: [failed], willRetry: false });
    expect(seen).toEqual([{ type: 'turn_end', turnId: 'failed-turn', status: 'error', errorMessage: failed.errorMessage, at: expect.any(String) }]);
    registry.beginTurn('psh_1', 'recovered-turn');
    emit({ type: 'agent_end', messages: [failed], willRetry: true });
    expect(seen).toHaveLength(1);
    emit({ type: 'agent_end', messages: [failed, { role: 'assistant', stopReason: 'stop' }], willRetry: false });
    expect(seen[1]).toEqual({ type: 'turn_end', turnId: 'recovered-turn', status: 'completed', at: expect.any(String) });
  });

  it('ends the turn the caller was given, not one Pi named', () => {
    const { registry, emit, seen } = registryWithSession();

    registry.beginTurn('psh_1', 'turn_abc');
    emit({ type: 'agent_start' });
    emit({ type: 'agent_end', messages: [], willRetry: false });

    expect(seen).toEqual([
      { type: 'turn_start', turnId: 'turn_abc', at: expect.any(String) },
      { type: 'turn_end', turnId: 'turn_abc', status: 'completed', at: expect.any(String) },
    ]);
  });

  it('keeps running while Pi retries the same run', () => {
    const { registry, emit, seen } = registryWithSession();

    registry.beginTurn('psh_1', 'turn_abc');
    emit({ type: 'agent_end', messages: [], willRetry: true });

    expect(seen).toEqual([]);

    emit({ type: 'agent_end', messages: [], willRetry: false });
    expect(seen).toEqual([{ type: 'turn_end', turnId: 'turn_abc', status: 'completed', at: expect.any(String) }]);
  });

  it('reports a cancelled turn as cancelled', () => {
    const { registry, emit, seen } = registryWithSession();

    registry.beginTurn('psh_1', 'turn_abc');
    registry.markAborting('psh_1');
    emit({ type: 'agent_end', messages: [] });

    expect(seen).toEqual([{ type: 'turn_end', turnId: 'turn_abc', status: 'aborted', at: expect.any(String) }]);
  });

  it('gives the next turn its own id, and does not carry the cancellation over', () => {
    const { registry, emit, seen } = registryWithSession();

    registry.beginTurn('psh_1', 'turn_one');
    registry.markAborting('psh_1');
    emit({ type: 'agent_end', messages: [] });

    registry.beginTurn('psh_1', 'turn_two');
    emit({ type: 'agent_end', messages: [] });

    expect(seen).toEqual([
      { type: 'turn_end', turnId: 'turn_one', status: 'aborted', at: expect.any(String) },
      { type: 'turn_end', turnId: 'turn_two', status: 'completed', at: expect.any(String) },
    ]);
  });

  it('says nothing about a turn nobody asked for', () => {
    const { emit, seen } = registryWithSession();

    // A compaction or a stray run with no prompt behind it. An empty id matches
    // no watcher, which is the point: it must not settle somebody else's turn.
    emit({ type: 'agent_end', messages: [] });

    expect(seen).toEqual([{ type: 'turn_end', turnId: '', status: 'completed', at: expect.any(String) }]);
  });

  it('does not let a finished turn claim what happens after it', () => {
    const { registry, emit, seen } = registryWithSession();

    registry.beginTurn('psh_1', 'turn_one');
    registry.markAborting('psh_1');
    emit({ type: 'agent_end', messages: [] });
    // A run the caller never asked for — a compaction, or Pi picking up work of
    // its own. It belongs to no turn, and it was not the thing that was cancelled.
    emit({ type: 'agent_end', messages: [] });

    expect(seen).toEqual([
      { type: 'turn_end', turnId: 'turn_one', status: 'aborted', at: expect.any(String) },
      { type: 'turn_end', turnId: '', status: 'completed', at: expect.any(String) },
    ]);
  });

  it('streams the answer as it is written, and what the session is doing', () => {
    const { registry, emit, seen } = registryWithSession();

    registry.beginTurn('psh_1', 'turn_abc');
    emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Fixing ' } });
    emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'the greeting.' } });
    emit({ type: 'tool_execution_start', toolCallId: 'c1', toolName: 'bash', args: { command: 'npm test\nsecond line' } });
    emit({ type: 'tool_execution_end', toolCallId: 'c1', toolName: 'bash', result: {}, isError: false });

    expect(seen).toEqual([
      { type: 'text', text: 'Fixing ' },
      { type: 'text', text: 'the greeting.' },
      { type: 'tool_start', toolName: 'bash', summary: 'npm test', callId: 'c1', at: expect.any(String) },
      { type: 'tool_end', toolName: 'bash', ok: true, callId: 'c1', at: expect.any(String) },
    ]);
  });

  it('does not stream the reasoning, only the answer and the acts', () => {
    const { registry, emit, seen } = registryWithSession();

    registry.beginTurn('psh_1', 'turn_abc');
    emit({ type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'maybe the name is empty' } });

    // Reasoning text produces nothing at all: its content never leaves the session.
    expect(seen).toEqual([]);

    emit({ type: 'message_start', message: {} });
    emit({ type: 'turn_start' });

    // A request identity is reported, because that is execution, not thought.
    // Pi's own `turn_start` maps to nothing; the caller's turn id governs.
    // This fake session names its model, so a request record carries it.
    expect(seen).toEqual([
      { type: 'request_start', requestId: null, model: 'anthropic/claude-test', at: expect.any(String) },
    ]);
    expect(JSON.stringify(seen)).not.toContain('maybe the name is empty');
  });

  it('reports a failed tool as failed', () => {
    const { registry, emit, seen } = registryWithSession();

    registry.beginTurn('psh_1', 'turn_abc');
    emit({ type: 'tool_execution_end', toolCallId: 'c1', toolName: 'read', result: {}, isError: true });

    expect(seen).toEqual([{ type: 'tool_end', toolName: 'read', ok: false, callId: 'c1', at: expect.any(String) }]);
  });

  it('does not let one bad watcher break the others', () => {
    const { registry, emit, seen } = registryWithSession();
    const angry = vi.fn(() => {
      throw new Error('no');
    });
    registry.watch('psh_1', angry);

    registry.beginTurn('psh_1', 'turn_abc');
    emit({ type: 'agent_end', messages: [] });

    expect(angry).toHaveBeenCalled();
    expect(seen).toEqual([{ type: 'turn_end', turnId: 'turn_abc', status: 'completed', at: expect.any(String) }]);
  });
});

describe('LiveSessionRegistry request and call identities', () => {
  it('names the model that actually runs on a request, and keeps two requests apart', () => {
    const { registry, emit, seen } = registryWithSession();
    registry.beginTurn('psh_1', 'turn_abc');

    emit({ type: 'message_start', message: { id: 'msg-1' } });
    emit({ type: 'message_end', message: { id: 'msg-1' } });
    emit({ type: 'message_start', message: { id: 'msg-2' } });

    expect(seen).toEqual([
      { type: 'request_start', requestId: 'msg-1', model: 'anthropic/claude-test', at: expect.any(String) },
      { type: 'request_end', requestId: 'msg-1', outcome: 'ok', at: expect.any(String) },
      { type: 'request_start', requestId: 'msg-2', model: 'anthropic/claude-test', at: expect.any(String) },
    ]);
  });

  it('keeps two parallel calls to the same tool apart by their call id', () => {
    const { registry, emit, seen } = registryWithSession();
    registry.beginTurn('psh_1', 'turn_abc');

    emit({ type: 'tool_execution_start', toolCallId: 'call-a', toolName: 'bash', args: { command: 'one' } });
    emit({ type: 'tool_execution_start', toolCallId: 'call-b', toolName: 'bash', args: { command: 'two' } });
    emit({ type: 'tool_execution_end', toolCallId: 'call-b', toolName: 'bash', isError: false });
    emit({ type: 'tool_execution_end', toolCallId: 'call-a', toolName: 'bash', isError: true });

    // The same tool name, four distinct records, each carrying its own identity.
    expect(seen.map((event) => (event.type === 'tool_start' || event.type === 'tool_end' ? event.callId : null)))
      .toEqual(['call-a', 'call-b', 'call-b', 'call-a']);
    expect(seen[3]).toMatchObject({ type: 'tool_end', ok: false });
    expect(seen[2]).toMatchObject({ type: 'tool_end', ok: true });
  });

  it('marks a compaction with the time it was observed', () => {
    const { registry, emit, seen } = registryWithSession();
    registry.beginTurn('psh_1', 'turn_abc');

    emit({ type: 'compaction_end' });
    // An aborted compaction is not a compaction.
    emit({ type: 'compaction_end', aborted: true });

    expect(seen).toEqual([{ type: 'compacted', at: expect.any(String) }]);
  });
});
