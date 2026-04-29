// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentStore } from '@/stores/agent';

const initialState = useAgentStore.getState();
const notifySessionSwitch = vi.fn().mockResolvedValue(undefined);
const open = vi.fn().mockResolvedValue([]);
const getCommands = vi.fn().mockResolvedValue([]);
const getModelState = vi.fn().mockResolvedValue(null);

beforeEach(() => {
  (globalThis as typeof globalThis & { window: any }).window = {
    ...globalThis.window,
    sero: {
      agent: {
        notifySessionSwitch,
        open,
        getCommands,
        getModelState,
      },
    },
  };
});

afterEach(() => {
  vi.clearAllMocks();
  useAgentStore.setState(initialState, true);
});

describe('agent store session switch notifications', () => {
  it('focusSession calls notifySessionSwitch for the previous session', () => {
    useAgentStore.setState({ focusedSessionId: 'session-A' });

    useAgentStore.getState().focusSession('session-B');

    expect(notifySessionSwitch).toHaveBeenCalledOnce();
    expect(notifySessionSwitch).toHaveBeenCalledWith('session-A', 'resume');
    expect(useAgentStore.getState().focusedSessionId).toBe('session-B');
  });

  it('openSession notifies when switching to an unopened session', async () => {
    useAgentStore.setState({ focusedSessionId: 'session-A' });

    await useAgentStore.getState().openSession(
      'session-B',
      '/tmp/session-B.jsonl',
      'workspace-1',
    );

    expect(notifySessionSwitch).toHaveBeenCalledOnce();
    expect(notifySessionSwitch).toHaveBeenCalledWith('session-A', 'resume');
    expect(open).toHaveBeenCalledWith('session-B', '/tmp/session-B.jsonl', 'workspace-1');
    expect(useAgentStore.getState().focusedSessionId).toBe('session-B');
  });

  it('focusSession does not notify when focusing the same session', () => {
    useAgentStore.setState({ focusedSessionId: 'session-A' });

    useAgentStore.getState().focusSession('session-A');

    expect(notifySessionSwitch).not.toHaveBeenCalled();
    expect(useAgentStore.getState().focusedSessionId).toBe('session-A');
  });

  it('focusSession does not notify when there is no previous session', () => {
    useAgentStore.setState({ focusedSessionId: null });

    useAgentStore.getState().focusSession('session-A');

    expect(notifySessionSwitch).not.toHaveBeenCalled();
  });

  it('clearFocus calls notifySessionSwitch for the defocused session', () => {
    useAgentStore.setState({ focusedSessionId: 'session-A' });

    useAgentStore.getState().clearFocus();

    expect(notifySessionSwitch).toHaveBeenCalledOnce();
    expect(notifySessionSwitch).toHaveBeenCalledWith('session-A', 'resume');
    expect(useAgentStore.getState().focusedSessionId).toBeNull();
  });

  it('clearFocus does not notify when no session is focused', () => {
    useAgentStore.setState({ focusedSessionId: null });

    useAgentStore.getState().clearFocus();

    expect(notifySessionSwitch).not.toHaveBeenCalled();
  });

  it('logs a warning when notifySessionSwitch fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    notifySessionSwitch.mockRejectedValueOnce(new Error('IPC failed'));
    useAgentStore.setState({ focusedSessionId: 'session-A' });

    useAgentStore.getState().focusSession('session-B');

    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        '[agent-store] notifySessionSwitch failed for',
        'session-A',
        expect.any(Error),
      );
    });

    warnSpy.mockRestore();
  });
});
