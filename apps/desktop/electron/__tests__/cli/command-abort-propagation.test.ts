import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { CliRegistry } from '../../cli/core/registry';
import { executeCliBatch } from '../../cli/core/tool';

function createContext(signal?: AbortSignal) {
  return {
    workspaceId: 'ws-1',
    cwd: '/tmp/ws-1',
    invocation: { workspaceId: 'ws-1', sessionId: 's-1', turnId: null, source: 'tool' as const, signal },
    workspaceManager: {} as never,
    containerManager: {} as never,
  };
}

describe('CLI command abort propagation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts the active bridged command when the per-command timeout expires', async () => {
    const registry = new CliRegistry();
    const abortSpy = vi.fn();

    registry.register({
      name: 'slow',
      summary: 'Slow command',
      timeoutMs: 1_000,
      execute: async (_args, context) => {
        context.invocation.signal?.addEventListener('abort', abortSpy, { once: true });
        return new Promise((_resolve, reject) => {
          context.invocation.signal?.addEventListener('abort', () => {
            reject(new Error('aborted inside command'));
          }, { once: true });
        });
      },
    });

    const pending = executeCliBatch(registry, 'slow', createContext());
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toEqual({
      output: 'ERROR: Command timed out after 1s',
      exitCode: 1,
    });
    expect(abortSpy).toHaveBeenCalledTimes(1);
  });

  it('propagates external cancellation into the active bridged command', async () => {
    const registry = new CliRegistry();
    const controller = new AbortController();
    const abortSpy = vi.fn();

    registry.register({
      name: 'wait',
      summary: 'Wait command',
      execute: async (_args, context) => {
        context.invocation.signal?.addEventListener('abort', abortSpy, { once: true });
        return new Promise((_resolve, reject) => {
          context.invocation.signal?.addEventListener('abort', () => {
            reject(new Error('aborted inside command'));
          }, { once: true });
        });
      },
    });

    const pending = executeCliBatch(registry, 'wait', createContext(controller.signal));
    controller.abort();
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toEqual({
      output: 'ERROR: Operation aborted',
      exitCode: 1,
    });
    expect(abortSpy).toHaveBeenCalledTimes(1);
  });
});
