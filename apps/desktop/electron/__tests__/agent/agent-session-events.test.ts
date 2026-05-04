import { describe, expect, it, vi } from 'vitest';

import {
  emitSessionShutdown,
  emitSessionBeforeSwitch,
} from '@electron/ipc/agent/core/agent-session-events';
import type { AgentSession } from '@mariozechner/pi-coding-agent';

function createMockSession(opts?: {
  hasRunner?: boolean;
  emitResult?: unknown;
  emitError?: Error;
}): AgentSession {
  const { hasRunner = true, emitResult, emitError } = opts ?? {};

  const emit = emitError
    ? vi.fn().mockRejectedValue(emitError)
    : vi.fn().mockResolvedValue(emitResult);

  return {
    extensionRunner: hasRunner ? { emit } : undefined,
  } as unknown as AgentSession;
}

describe('emitSessionShutdown', () => {
  it('emits session_shutdown on the extension runner and returns true', async () => {
    const session = createMockSession();
    const result = await emitSessionShutdown(session);

    expect(result).toBe(true);
    expect(session.extensionRunner!.emit).toHaveBeenCalledOnce();
    expect(session.extensionRunner!.emit).toHaveBeenCalledWith({
      type: 'session_shutdown',
      reason: 'quit',
    });
  });

  it('returns false when no extension runner is available', async () => {
    const session = createMockSession({ hasRunner: false });
    const result = await emitSessionShutdown(session);

    expect(result).toBe(false);
  });

  it('propagates errors from the extension runner', async () => {
    const session = createMockSession({
      emitError: new Error('handler failed'),
    });

    await expect(emitSessionShutdown(session)).rejects.toThrow('handler failed');
  });
});

describe('emitSessionBeforeSwitch', () => {
  it('emits session_before_switch with the given reason', async () => {
    const session = createMockSession({ emitResult: { cancelled: false } });
    const result = await emitSessionBeforeSwitch(session, 'resume');

    expect(result).toEqual({ cancelled: false });
    expect(session.extensionRunner!.emit).toHaveBeenCalledWith({
      type: 'session_before_switch',
      reason: 'resume',
    });
  });

  it('passes "new" reason through to the event', async () => {
    const session = createMockSession();
    await emitSessionBeforeSwitch(session, 'new');

    expect(session.extensionRunner!.emit).toHaveBeenCalledWith({
      type: 'session_before_switch',
      reason: 'new',
    });
  });

  it('returns undefined when no extension runner is available', async () => {
    const session = createMockSession({ hasRunner: false });
    const result = await emitSessionBeforeSwitch(session, 'resume');

    expect(result).toBeUndefined();
  });

  it('propagates errors from the extension runner', async () => {
    const session = createMockSession({
      emitError: new Error('switch handler failed'),
    });

    await expect(emitSessionBeforeSwitch(session, 'resume')).rejects.toThrow(
      'switch handler failed',
    );
  });
});
