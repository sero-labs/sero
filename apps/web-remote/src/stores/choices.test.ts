import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useConnectionStore } from '@/stores/connection';
import { useChoicesStore } from '@/stores/choices';
import type { GatewayMessage } from '@/lib/gateway-client';

const answerChoice = vi.fn((_id: string, _optionId: string) => {});

function request(id: string, extra: Record<string, unknown> = {}): GatewayMessage {
  return {
    type: 'choice_request',
    id,
    workspaceId: 'ws-1',
    title: 'Workspace has changes',
    body: 'Where should this run?',
    options: [
      { id: 'worktree', label: 'New worktree' },
      { id: 'in-place', label: 'In place', description: 'Keeps your changes' },
    ],
    ts: Date.now(),
    ...extra,
  } as unknown as GatewayMessage;
}

function resolvedEvent(id: string): GatewayMessage {
  return { type: 'choice_resolved', id, outcome: 'answered', ts: Date.now() } as unknown as GatewayMessage;
}

describe('choices store', () => {
  beforeEach(() => {
    answerChoice.mockClear();
    useConnectionStore.setState({ client: { answerChoice } as unknown as never });
    useChoicesStore.setState({ choices: [], answering: [], error: null });
  });

  it('shows a choice that arrives', () => {
    useChoicesStore.getState().handleMessage(request('c1'));

    expect(useChoicesStore.getState().choices).toHaveLength(1);
    expect(useChoicesStore.getState().choices[0]?.options).toHaveLength(2);
    expect(useChoicesStore.getState().choices[0]?.options[1]?.description).toBe('Keeps your changes');
  });

  it('keeps choices in arrival order, oldest first', () => {
    useChoicesStore.getState().handleMessage(request('c1'));
    useChoicesStore.getState().handleMessage(request('c2'));

    expect(useChoicesStore.getState().choices.map((choice) => choice.id)).toEqual(['c1', 'c2']);
  });

  it('does not show the same choice twice after a reconnect replay', () => {
    useChoicesStore.getState().handleMessage(request('c1'));
    useChoicesStore.getState().handleMessage(request('c1'));

    expect(useChoicesStore.getState().choices).toHaveLength(1);
  });

  it('ignores a choice with no options', () => {
    useChoicesStore.getState().handleMessage(request('c1', { options: [] }));

    expect(useChoicesStore.getState().choices).toEqual([]);
  });

  it('sends the answer and waits for the gateway to confirm', () => {
    useChoicesStore.getState().handleMessage(request('c1'));

    useChoicesStore.getState().answer('c1', 'worktree');

    expect(answerChoice).toHaveBeenCalledWith('c1', 'worktree');
    // The card stays until choice_resolved: an answer that loses a race
    // must not look like it won.
    expect(useChoicesStore.getState().choices).toHaveLength(1);
    expect(useChoicesStore.getState().answering).toEqual(['c1']);
  });

  it('dismisses the choice when the gateway says it is over', () => {
    useChoicesStore.getState().handleMessage(request('c1'));
    useChoicesStore.getState().answer('c1', 'worktree');

    useChoicesStore.getState().handleMessage(resolvedEvent('c1'));

    expect(useChoicesStore.getState().choices).toEqual([]);
    expect(useChoicesStore.getState().answering).toEqual([]);
  });

  it('dismisses a choice answered somewhere else', () => {
    useChoicesStore.getState().handleMessage(request('c1'));

    useChoicesStore.getState().handleMessage(resolvedEvent('c1'));

    expect(useChoicesStore.getState().choices).toEqual([]);
  });

  it('frees the buttons and shows why when the answer is refused', () => {
    useChoicesStore.getState().handleMessage(request('c1'));
    useChoicesStore.getState().answer('c1', 'worktree');

    useChoicesStore.getState().handleMessage({
      type: 'error',
      requestType: 'answer_choice',
      message: 'This choice is no longer open.',
    } as GatewayMessage);

    expect(useChoicesStore.getState().answering).toEqual([]);
    expect(useChoicesStore.getState().error).toBe('This choice is no longer open.');
  });

  it('clears the last error when a new answer is sent', () => {
    useChoicesStore.setState({ error: 'old failure' });
    useChoicesStore.getState().handleMessage(request('c1'));

    useChoicesStore.getState().answer('c1', 'worktree');

    expect(useChoicesStore.getState().error).toBeNull();
  });

  it('sends nothing while disconnected', () => {
    useConnectionStore.setState({ client: null as unknown as never });
    useChoicesStore.getState().handleMessage(request('c1'));

    useChoicesStore.getState().answer('c1', 'worktree');

    expect(useChoicesStore.getState().answering).toEqual([]);
  });
});
