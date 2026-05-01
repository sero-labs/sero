import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Type } from '@sinclair/typebox';

import { CliRegistry } from '@electron/cli/core/registry';
import { bridgeTool } from '@electron/cli/core/schema-bridge';
import { createSeroCliTool, executeCliBatch } from '@electron/cli/core/tool';
import { installCliSessionBridge } from '@electron/cli/bridges/session-bridge';
import { convertSessionMessages } from '@electron/ipc/agent/core/agent-helpers';
import { subscribeToSession } from '@electron/ipc/agent/core/agent-subscription';
import { workspaceManager } from '@electron/shared/infra/shared-infra';

describe('CLI bridge rich output', () => {
  beforeEach(() => {
    vi.spyOn(workspaceManager, 'getPath').mockReturnValue('/tmp/ws-1');
    installCliSessionBridge({
      getSessionEntry: () => undefined,
      getActiveSessionForWorkspace: () => undefined,
      getActiveTurnId: () => null,
      noteTurnStart: () => {},
      noteTurnEnd: () => {},
      consumeTurnBudget: () => ({ allowed: true, count: 0, limit: 50 }),
      setSessionTitle: () => {},
    });
  });

  it('preserves image blocks and details for single bridged tool commands', async () => {
    const registry = new CliRegistry();
    registry.register(bridgeTool('plugin_capture', {
      name: 'plugin_capture',
      label: 'Plugin Capture',
      description: 'Capture a screenshot',
      parameters: Type.Object({ target: Type.String() }),
      execute: async () => ({
        content: [
          { type: 'text', text: 'Screenshot ready' },
          { type: 'image', data: 'abc123', mimeType: 'image/png' },
        ],
        details: { source: 'plugin', width: 800 },
      }),
    }));

    const tool = createSeroCliTool(registry, 'ws-1', 'session-1');
    const result = await tool.execute(
      'tool-1',
      { command: 'plugin_capture hero' },
      undefined,
      undefined,
      { cwd: '/tmp/ws-1' } as never,
    );

    expect(result.content).toEqual([
      { type: 'text', text: 'Screenshot ready' },
      { type: 'image', data: 'abc123', mimeType: 'image/png' },
    ]);
    expect(result.details).toEqual({ exitCode: 0, source: 'plugin', width: 800 });
  });

  it('falls back to text-only content for multi-command batches with rich output', async () => {
    const registry = new CliRegistry();
    registry.register({
      name: 'capture',
      summary: 'Capture',
      execute: async () => ({
        output: 'Screenshot ready',
        exitCode: 0,
        content: [
          { type: 'text', text: 'Screenshot ready' },
          { type: 'image', data: 'abc123', mimeType: 'image/png' },
        ],
        details: { source: 'plugin', imagePaths: ['/tmp/capture.png'] },
      }),
    });
    registry.register({
      name: 'echo',
      summary: 'Echo',
      execute: async () => ({ output: 'done', exitCode: 0 }),
    });

    const tool = createSeroCliTool(registry, 'ws-1', 'session-1');
    const result = await tool.execute(
      'tool-1',
      { command: 'capture\necho' },
      undefined,
      undefined,
      { cwd: '/tmp/ws-1' } as never,
    );

    expect(result.content).toEqual([
      {
        type: 'text',
        text: '$ sero capture\nScreenshot ready\n\n$ sero echo\ndone\n\n[rich output omitted in multi-command batch; rerun the image-producing command alone to view images]',
      },
    ]);
    expect(result.details).toEqual({
      exitCode: 0,
      imagePaths: ['/tmp/capture.png'],
      richOutputFallback: true,
      fallbackReason: 'multi-command batches return text-only content to avoid dropping or interleaving rich blocks',
    });
  });

  it('maps rich tool updates through agent streaming and history replay helpers', async () => {
    const sendEvent = vi.fn();
    const unsubscribe = subscribeToSession(
      'session-1',
      {
        subscribe: (handler: (event: unknown) => void) => {
          handler({
            type: 'tool_execution_update',
            toolCallId: 'tc-1',
            partialResult: {
              content: [
                { type: 'text', text: 'Screenshot ready' },
                { type: 'image', data: 'abc123', mimeType: 'image/png' },
              ],
              details: { stage: 'capture', savedPath: '/tmp/screenshot.png' },
            },
          });
          handler({
            type: 'tool_execution_end',
            toolCallId: 'tc-1',
            result: {
              content: [
                { type: 'text', text: 'Screenshot ready' },
                { type: 'image', data: 'abc123', mimeType: 'image/png' },
              ],
              details: { stage: 'done', savedPath: '/tmp/screenshot.png' },
            },
            isError: false,
          });
          return () => {};
        },
      } as never,
      () => ({
        session: { messages: [] } as never,
        workspaceId: 'ws-1',
        currentAssistantId: null,
        pendingTurnUndoUserMessageId: null,
      }),
      sendEvent,
    );
    unsubscribe();

    expect(sendEvent).toHaveBeenNthCalledWith(1, {
      type: 'tool_update',
      sessionId: 'session-1',
      toolCallId: 'tc-1',
      output: 'Screenshot ready',
      details: { stage: 'capture', savedPath: '/tmp/screenshot.png' },
      images: [{ data: 'abc123', mimeType: 'image/png', description: 'Screenshot ready', filePath: '/tmp/screenshot.png' }],
    });
    expect(sendEvent).toHaveBeenNthCalledWith(2, {
      type: 'tool_end',
      sessionId: 'session-1',
      toolCallId: 'tc-1',
      output: 'Screenshot ready',
      details: { stage: 'done', savedPath: '/tmp/screenshot.png' },
      isError: false,
      images: [{ data: 'abc123', mimeType: 'image/png', description: 'Screenshot ready', filePath: '/tmp/screenshot.png' }],
    });

    const messages = convertSessionMessages([
      {
        role: 'assistant',
        content: [
          { type: 'toolCall', id: 'tc-1', name: 'sero-cli', arguments: { command: 'capture' } },
        ],
      },
      {
        role: 'toolResult',
        toolCallId: 'tc-1',
        isError: false,
        content: [
          { type: 'text', text: 'Screenshot ready' },
          { type: 'image', data: 'abc123', mimeType: 'image/png' },
        ],
        details: { exitCode: 0, source: 'plugin', savedPath: '/tmp/screenshot.png' },
      },
    ] as never);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: 'tool',
      toolName: 'sero-cli',
      output: 'Screenshot ready',
      details: { exitCode: 0, source: 'plugin', savedPath: '/tmp/screenshot.png' },
      images: [{ data: 'abc123', mimeType: 'image/png', description: 'Screenshot ready', filePath: '/tmp/screenshot.png' }],
    });
  });

  it('converts legacy JSON image output into rich image blocks for single commands', async () => {
    const registry = new CliRegistry();
    registry.register({
      name: 'capture_legacy',
      summary: 'Capture legacy screenshot',
      execute: async () => ({
        output: JSON.stringify({
          type: 'image',
          format: 'png',
          base64: 'abc123',
          description: 'Legacy screenshot',
        }),
        exitCode: 0,
      }),
    });

    const tool = createSeroCliTool(registry, 'ws-1', 'session-1');
    const result = await tool.execute(
      'tool-legacy',
      { command: 'capture_legacy' },
      undefined,
      undefined,
      { cwd: '/tmp/ws-1' } as never,
    );

    expect(result.content).toEqual([
      { type: 'text', text: 'Legacy screenshot' },
      { type: 'image', data: 'abc123', mimeType: 'image/png' },
    ]);
  });

  it('maps legacy JSON image text payloads through live tool streaming', async () => {
    const sendEvent = vi.fn();
    const unsubscribe = subscribeToSession(
      'session-1',
      {
        subscribe: (handler: (event: unknown) => void) => {
          handler({
            type: 'tool_execution_end',
            toolCallId: 'tc-legacy',
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    type: 'image',
                    format: 'png',
                    base64: 'abc123',
                    description: 'Legacy screenshot',
                  }),
                },
              ],
              details: { stage: 'done' },
            },
            isError: false,
          });
          return () => {};
        },
      } as never,
      () => ({
        session: { messages: [] } as never,
        workspaceId: 'ws-1',
        currentAssistantId: null,
        pendingTurnUndoUserMessageId: null,
      }),
      sendEvent,
    );
    unsubscribe();

    expect(sendEvent).toHaveBeenCalledWith({
      type: 'tool_end',
      sessionId: 'session-1',
      toolCallId: 'tc-legacy',
      output: 'Legacy screenshot',
      details: { stage: 'done' },
      isError: false,
      images: [{ data: 'abc123', mimeType: 'image/png', description: 'Legacy screenshot' }],
    });
  });

  it('keeps executeCliBatch text output unchanged for normal text commands', async () => {
    const registry = new CliRegistry();
    registry.register({
      name: 'echo',
      summary: 'Echo',
      execute: async () => ({ output: 'hello', exitCode: 0 }),
    });

    const result = await executeCliBatch(registry, 'echo', {
      workspaceId: 'ws-1',
      cwd: '/tmp/ws-1',
      invocation: { workspaceId: 'ws-1', sessionId: 's-1', turnId: null, source: 'tool' },
      workspaceManager: {} as never,
      containerManager: {} as never,
    });

    expect(result).toEqual({ output: 'hello', exitCode: 0, content: undefined, details: undefined });
  });
});
