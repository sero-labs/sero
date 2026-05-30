import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  askQuestion: vi.fn(),
  hasSeroIPCBridge: vi.fn(),
  nextQuestionId: vi.fn(() => 'perm-1'),
}));

vi.mock('../ipc-bridge', () => ({
  askQuestion: mocks.askQuestion,
  hasSeroIPCBridge: mocks.hasSeroIPCBridge,
  nextQuestionId: mocks.nextQuestionId,
}));

import { registerPermissionGate } from '../permission-gate';

interface ToolCallEvent {
  toolName: string;
  toolCallId: string;
  input: { command: string };
}

interface ToolCallContext {
  cwd?: string;
  hasUI?: boolean;
}

type ToolCallHandler = (
  event: ToolCallEvent,
  context: ToolCallContext,
) => Promise<{ block: true; reason: string } | undefined> | undefined;

describe('registerPermissionGate', () => {
  let handler: ToolCallHandler | null = null;

  beforeEach(() => {
    handler = null;
    mocks.askQuestion.mockReset();
    mocks.hasSeroIPCBridge.mockReset();
    mocks.nextQuestionId.mockClear();

    const pi: Pick<ExtensionAPI, 'on'> = {
      on: (eventName, callback) => {
        if (eventName === 'tool_call') {
          handler = callback as ToolCallHandler;
        }
      },
    };

    registerPermissionGate(pi as ExtensionAPI);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-allows workspace-scoped recursive deletes without opening the feedback flow', async () => {
    mocks.hasSeroIPCBridge.mockReturnValue(true);

    const result = await handler?.(
      {
        toolName: 'bash',
        toolCallId: 'call-1',
        input: { command: 'rm -rf build/cache' },
      },
      { cwd: '/workspace/project' },
    );

    expect(result).toBeUndefined();
    expect(mocks.askQuestion).not.toHaveBeenCalled();
  });

  it('blocks dangerous commands when Sero approval times out', async () => {
    vi.useFakeTimers();
    mocks.hasSeroIPCBridge.mockReturnValue(true);
    mocks.askQuestion.mockImplementation(
      (_payload: unknown, signal: AbortSignal) =>
        new Promise((resolve) => {
          signal.addEventListener(
            'abort',
            () => resolve({ answers: [], cancelled: true }),
            { once: true },
          );
        }),
    );

    const pendingResult = handler?.(
      {
        toolName: 'bash',
        toolCallId: 'call-2',
        input: { command: 'sudo rm -rf /tmp/outside-workspace' },
      },
      { cwd: '/workspace/project' },
    );

    await vi.advanceTimersByTimeAsync(30_000);

    await expect(pendingResult).resolves.toEqual({
      block: true,
      reason: 'Dangerous command blocked — approval timed out after 30s',
    });
  });
});
