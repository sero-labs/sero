import { describe, expect, it } from 'vitest';
import { RemoteConversationBoundary, remoteSessionKey } from '@electron/features/agent-node/normalize';
import { deterministicRetryDelay } from '@electron/features/agent-node/sse';

describe('Agent Node conversation boundary', () => {
  it('creates collision-safe keys distinct from local session IDs', () => {
    expect(remoteSessionKey('a:b', 'c')).not.toBe(remoteSessionKey('a', 'b:c'));
    expect(remoteSessionKey('node', 'context')).not.toBe('context');
  });

  it('normalizes replay messages and advances the durable cursor', () => {
    const boundary = new RemoteConversationBoundary(remoteSessionKey('node', 'context'));
    const events = boundary.accept({
      type: 'entry',
      entry: { id: 'deadbeef', parentId: null, data: { role: 'assistant', parts: [{ text: 'Done' }] } },
    });
    expect(events[0]).toMatchObject({ type: 'message_start', message: { text: 'Done' } });
    expect(boundary.snapshot()).toMatchObject({ cursor: 'deadbeef', messages: [{ text: 'Done' }] });
  });

  it('uses deterministic capped retry intervals', () => {
    expect([0, 1, 2, 5].map(deterministicRetryDelay)).toEqual([250, 500, 1000, 5000]);
  });
});
