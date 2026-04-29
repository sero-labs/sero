import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Type } from '@sinclair/typebox';

import { bridgeTool, getBridgedToolTimeoutMs } from '@electron/cli/core/schema-bridge';
import { CliRegistry } from '@electron/cli/core/registry';
import { executeCliBatch } from '@electron/cli/core/tool';
import {
  buildBatchDeadline,
  DEFAULT_PER_COMMAND_TIMEOUT_MS,
  resolveCommandTimeoutMs,
} from '@electron/cli/core/timeouts';

describe('CLI bridged command timeouts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('assigns a longer timeout to fetch_content when bridged through sero-cli', () => {
    const bridged = bridgeTool('fetch_content', {
      name: 'fetch_content',
      label: 'Fetch Content',
      description: 'Fetch URL content',
      parameters: Type.Object({ url: Type.String() }),
      execute: async () => ({
        content: [{ type: 'text', text: 'ok' }],
        details: null,
      }),
    });

    expect(bridged.timeoutMs).toBe(300_000);
    expect(getBridgedToolTimeoutMs('fetch_content')).toBe(300_000);
  });

  it('does not apply the implicit batch deadline to single tool commands', () => {
    const deadline = buildBatchDeadline('tool', undefined, true);

    expect(deadline).toBeNull();
    expect(resolveCommandTimeoutMs(deadline, getBridgedToolTimeoutMs('fetch_content'))).toBe(300_000);
  });

  it('still caps multi-command batches with the shared default deadline', () => {
    const deadline = buildBatchDeadline('tool', undefined, false);

    expect(deadline).toBe(Date.now() + 120_000);
    expect(resolveCommandTimeoutMs(deadline, getBridgedToolTimeoutMs('fetch_content'))).toBe(120_000);
  });

  it('keeps the standard timeout for normal bridged commands', () => {
    const deadline = buildBatchDeadline('tool', undefined, true);

    expect(resolveCommandTimeoutMs(deadline, getBridgedToolTimeoutMs('notes'))).toBe(DEFAULT_PER_COMMAND_TIMEOUT_MS);
  });

  it('skips per-command timeout for interactive commands', async () => {
    const registry = new CliRegistry();
    let resolveCommand: ((value: { output: string; exitCode: number }) => void) | null = null;

    registry.register({
      name: 'question',
      summary: 'Ask the user',
      interactive: true,
      execute: async () => {
        // Simulate waiting for user input — resolves via external trigger
        return new Promise<{ output: string; exitCode: number }>((resolve) => {
          resolveCommand = resolve;
        });
      },
    });

    const pending = executeCliBatch(registry, 'question', {
      workspaceId: 'ws-1',
      cwd: '/tmp/ws-1',
      invocation: { workspaceId: 'ws-1', sessionId: 's-1', turnId: null, source: 'tool' },
      workspaceManager: {} as never,
      containerManager: {} as never,
    });

    // Advance past the default 30s per-command timeout
    await vi.advanceTimersByTimeAsync(60_000);

    // Command should NOT have timed out — it's interactive
    resolveCommand!({ output: 'User answered', exitCode: 0 });

    const result = await pending;
    expect(result.output).toBe('User answered');
    expect(result.exitCode).toBe(0);
  });

  it('returns a deterministic timeout error and suppresses late updates after cancellation', async () => {
    const registry = new CliRegistry();
    const onUpdate = vi.fn();
    const lateUpdate = vi.fn();

    registry.register({
      name: 'slow',
      summary: 'Slow command',
      timeoutMs: 1_000,
      execute: async (_args, context, commandOnUpdate) => {
        setTimeout(() => {
          commandOnUpdate?.({
            content: [{ type: 'text', text: 'late update' }],
            details: { phase: 'late' },
          });
          lateUpdate();
        }, 1_500);

        return new Promise((_resolve, reject) => {
          context.invocation.signal?.addEventListener('abort', () => {
            reject(new Error('command observed abort'));
          }, { once: true });
        });
      },
    });

    const pending = executeCliBatch(registry, 'slow', {
      workspaceId: 'ws-1',
      cwd: '/tmp/ws-1',
      invocation: { workspaceId: 'ws-1', sessionId: 's-1', turnId: null, source: 'tool' },
      workspaceManager: {} as never,
      containerManager: {} as never,
    }, undefined, onUpdate);

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toEqual({
      output: 'ERROR: Command timed out after 1s',
      exitCode: 1,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(lateUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
