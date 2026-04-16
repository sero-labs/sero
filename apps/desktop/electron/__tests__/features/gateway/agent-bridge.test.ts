import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  forwardEventToGateway,
  setGatewayEventSink,
  subscribeGatewayEvents,
} from '@electron/features/gateway/bridge/agent-bridge';

describe('gateway agent bridge listeners', () => {
  afterEach(() => {
    setGatewayEventSink({ pushEvent: () => {} });
  });

  it('forwards mapped events to sink and subscribed listeners', () => {
    const sinkPush = vi.fn();
    setGatewayEventSink({ pushEvent: sinkPush });

    const listener = vi.fn();
    const unsubscribe = subscribeGatewayEvents(listener);

    forwardEventToGateway({
      type: 'text_delta',
      sessionId: 'session-1',
      delta: 'hello',
    });

    expect(sinkPush).toHaveBeenCalledWith('session-1', {
      type: 'text_delta',
      sessionId: 'session-1',
      delta: 'hello',
    });
    expect(listener).toHaveBeenCalledWith({
      type: 'text_delta',
      sessionId: 'session-1',
      delta: 'hello',
    });

    unsubscribe();

    forwardEventToGateway({
      type: 'text_delta',
      sessionId: 'session-1',
      delta: 'world',
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
