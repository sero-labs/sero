import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  broadcastToWindows: vi.fn(),
  sendToWindows: vi.fn(),
  forwardEventToGateway: vi.fn(),
}));

vi.mock('@electron/ipc/lib/window-broadcast', () => ({
  broadcastToWindows: mocks.broadcastToWindows,
  sendToWindows: mocks.sendToWindows,
}));
vi.mock('@electron/features/gateway/bridge/agent-bridge', () => ({
  forwardEventToGateway: mocks.forwardEventToGateway,
}));

import {
  clearSessionViewers,
  emitAgentEvent,
  registerSessionViewer,
  unregisterSessionViewer,
} from '@electron/ipc/agent/core/agent-event-broadcast';

function contents(id: number) {
  const listeners = new Map<string, () => void>();
  return {
    id,
    once: vi.fn((name: string, listener: () => void) => { listeners.set(name, listener); }),
    destroy: () => listeners.get('destroyed')?.(),
  };
}

describe('emitAgentEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSessionViewers('s1');
    clearSessionViewers('s2');
  });

  it('sends a session event only to the windows that opened that session', () => {
    registerSessionViewer('s1', contents(7));
    registerSessionViewer('s1', contents(9));
    registerSessionViewer('s2', contents(11));

    emitAgentEvent({ type: 'agent_start', sessionId: 's1' });

    expect(mocks.sendToWindows).toHaveBeenCalledTimes(1);
    expect([...mocks.sendToWindows.mock.calls[0][0]]).toEqual([7, 9]);
    expect(mocks.broadcastToWindows).not.toHaveBeenCalled();
    expect(mocks.forwardEventToGateway).toHaveBeenCalledWith({ type: 'agent_start', sessionId: 's1' });
  });

  it('broadcasts events for a session no window opened', () => {
    emitAgentEvent({ type: 'agent_start', sessionId: 's2' });

    expect(mocks.broadcastToWindows).toHaveBeenCalledTimes(1);
    expect(mocks.sendToWindows).not.toHaveBeenCalled();
  });

  it('forgets a window when it is destroyed or unregistered', () => {
    const gone = contents(7);
    registerSessionViewer('s1', gone);
    registerSessionViewer('s1', contents(9));
    gone.destroy();
    unregisterSessionViewer('s1', 9);

    emitAgentEvent({ type: 'agent_start', sessionId: 's1' });

    expect(mocks.broadcastToWindows).toHaveBeenCalledTimes(1);
  });
});
