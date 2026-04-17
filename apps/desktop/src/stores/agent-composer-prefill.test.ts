// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatComposerPrefill } from '@/types/ipc';
import { useAgentStore } from './agent';

describe('agent composer prefill store state', () => {
  const initialState = useAgentStore.getState();

  beforeEach(() => {
    useAgentStore.setState(initialState, true);
  });

  afterEach(() => {
    useAgentStore.setState(initialState, true);
  });

  it('stores prefills per session and clears only the matching request', () => {
    const first: ChatComposerPrefill = {
      requestId: 'prefill-1',
      text: 'retry this prompt',
      source: 'turn-undo',
    };
    const second: ChatComposerPrefill = {
      requestId: 'prefill-2',
      text: 'other session draft',
      source: 'system',
    };

    useAgentStore.getState().setComposerPrefill('session-1', first);
    useAgentStore.getState().setComposerPrefill('session-2', second);
    useAgentStore.getState().clearComposerPrefill('session-1', 'wrong-id');

    expect(useAgentStore.getState().composerPrefills).toEqual({
      'session-1': first,
      'session-2': second,
    });

    useAgentStore.getState().clearComposerPrefill('session-1', first.requestId);

    expect(useAgentStore.getState().composerPrefills).toEqual({
      'session-2': second,
    });
  });

  it('clears the session draft without a request id guard when asked directly', () => {
    const prefill: ChatComposerPrefill = {
      requestId: 'prefill-3',
      text: 'rewrite this',
      source: 'turn-undo',
    };

    useAgentStore.getState().setComposerPrefill('session-3', prefill);
    useAgentStore.getState().clearComposerPrefill('session-3');

    expect(useAgentStore.getState().composerPrefills['session-3']).toBeUndefined();
  });
});
