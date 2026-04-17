import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatAttachment, AgentStreamEvent, ChatTurnUndoRef } from '@/types/ipc';
import { workspaceManager } from '@electron/shared/infra/shared-infra';
import {
  buildDirectCliExtensionContext,
  executeDirectCliPrompt,
  handlePromptInput,
  isDirectSeroCliPrompt,
  type PromptPoolEntry,
} from '@electron/ipc/agent/core/agent-prompt';

describe('direct CLI chat prompts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects raw sero commands and ignores normal prompts or attachments', () => {
    const attachment: ChatAttachment = {
      id: 'att-1',
      filename: 'note.txt',
      mediaType: 'text/plain',
      url: 'data:text/plain;base64,SGk=',
    };

    expect(isDirectSeroCliPrompt('sero memory read --target memory')).toBe(true);
    expect(isDirectSeroCliPrompt('  sero help memory\nsero memory read --target daily  ')).toBe(true);
    expect(isDirectSeroCliPrompt('Run sero memory read --target memory')).toBe(false);
    expect(isDirectSeroCliPrompt('sero memory read --target memory', [attachment])).toBe(false);
  });

  it('executes direct sero prompts without routing them through the model', async () => {
    vi.spyOn(workspaceManager, 'getPath').mockReturnValue('/tmp/ws-1');

    const agentAppendMessage = vi.fn();
    const sessionAppendMessage = vi.fn();
    const prompt = vi.fn();
    const sendEvent = vi.fn<(event: AgentStreamEvent) => void>();

    const entry: PromptPoolEntry = {
      workspaceId: 'ws-1',
      lastCompletedTurnUndo: null,
      session: {
        model: { api: 'anthropic-messages', provider: 'anthropic', id: 'claude-sonnet' },
        prompt,
        agent: { appendMessage: agentAppendMessage },
        sessionManager: {
          getCwd: () => '/tmp/ws-1',
          appendMessage: sessionAppendMessage,
        },
      } as never,
    };

    await executeDirectCliPrompt({
      entry,
      sessionId: 'session-1',
      text: 'sero memory read --target memory --with_ids true',
      sendEvent,
      executeTool: async ({ onUpdate }) => {
        onUpdate?.({
          content: [{ type: 'text', text: 'loading' }],
          details: { stage: 'running' },
        });
        return {
          content: [{ type: 'text', text: 'done' }],
          details: { exitCode: 0 },
        };
      },
    });

    expect(prompt).not.toHaveBeenCalled();
    expect(agentAppendMessage).toHaveBeenCalledTimes(3);
    expect(sessionAppendMessage).toHaveBeenCalledTimes(3);

    expect(agentAppendMessage.mock.calls[0]?.[0]).toMatchObject({
      role: 'user',
      content: 'sero memory read --target memory --with_ids true',
    });
    expect(agentAppendMessage.mock.calls[1]?.[0]).toMatchObject({
      role: 'assistant',
      content: [{ type: 'toolCall', name: 'sero-cli', arguments: { command: 'sero memory read --target memory --with_ids true' } }],
      stopReason: 'toolUse',
    });
    expect(agentAppendMessage.mock.calls[2]?.[0]).toMatchObject({
      role: 'toolResult',
      toolName: 'sero-cli',
      isError: false,
      details: { exitCode: 0 },
      content: [{ type: 'text', text: 'done' }],
    });

    expect(sendEvent.mock.calls.map(([event]) => event.type)).toEqual([
      'agent_start',
      'tool_start',
      'tool_update',
      'tool_end',
      'agent_end',
    ]);
  });

  it('uses the session cwd for direct sero prompts instead of the workspace root', async () => {
    vi.spyOn(workspaceManager, 'getPath').mockReturnValue('/tmp/ws-1');

    const executeTool = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'done' }],
      details: { exitCode: 0 },
    });
    const sendEvent = vi.fn<(event: AgentStreamEvent) => void>();

    const entry: PromptPoolEntry = {
      workspaceId: 'ws-1',
      lastCompletedTurnUndo: null,
      session: {
        model: { api: 'anthropic-messages', provider: 'anthropic', id: 'claude-sonnet' },
        agent: { appendMessage: vi.fn() },
        sessionManager: {
          getCwd: () => '/tmp/ws-1/packages/app',
          appendMessage: vi.fn(),
        },
      } as never,
    };

    await executeDirectCliPrompt({
      entry,
      sessionId: 'session-1',
      text: 'sero memory read --target memory',
      sendEvent,
      executeTool,
    });

    expect(executeTool).toHaveBeenCalledWith(expect.objectContaining({
      cwd: '/tmp/ws-1/packages/app',
    }));
  });

  it('builds a full extension context for direct sero commands', async () => {
    const abort = vi.fn().mockResolvedValue(undefined);
    const compact = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn();
    const onError = vi.fn();
    const sessionManager = {
      getCwd: () => '/tmp/ws-1/packages/app',
      getSessionId: vi.fn(() => 'session-1'),
      appendMessage: vi.fn(),
    };
    const modelRegistry = { getApiKey: vi.fn() };

    const entry: PromptPoolEntry = {
      workspaceId: 'ws-1',
      lastCompletedTurnUndo: null,
      session: {
        model: { api: 'anthropic-messages', provider: 'anthropic', id: 'claude-sonnet' },
        modelRegistry,
        abort,
        compact,
        getContextUsage: () => undefined,
        agent: {
          state: { systemPrompt: 'system prompt' },
          appendMessage: vi.fn(),
        },
        sessionManager,
      } as never,
    };

    const ctx = buildDirectCliExtensionContext(entry, '/tmp/ws-1/packages/app');
    ctx.compact({ customInstructions: 'summarize', onComplete, onError });
    await Promise.resolve();

    expect(ctx.cwd).toBe('/tmp/ws-1/packages/app');
    expect(ctx.model).toBe(entry.session.model);
    expect(ctx.modelRegistry).toBe(modelRegistry as never);
    expect(ctx.sessionManager).toBe(sessionManager as never);
    expect(ctx.getSystemPrompt()).toBe('system prompt');
    expect(compact).toHaveBeenCalledWith('summarize');
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it('uses the normal agent prompt path for non-sero text and preserves turn-undo refs', async () => {
    const prompt = vi.fn();
    const sendEvent = vi.fn<(event: AgentStreamEvent) => void>();
    const turnUndo: ChatTurnUndoRef = {
      kind: 'checkpoint',
      changeId: 'cp-1',
      label: 'checkpoint',
      createdAt: '2026-04-01T10:00:00.000Z',
    };

    const entry: PromptPoolEntry = {
      workspaceId: 'ws-1',
      lastCompletedTurnUndo: turnUndo,
      session: {
        prompt,
      } as never,
    };

    await handlePromptInput({
      entry,
      sessionId: 'session-1',
      text: 'Please summarize this memory change.',
      clientMessageId: 'msg-user-1',
      sendEvent,
    });

    expect(prompt).toHaveBeenCalledWith('Please summarize this memory change.', undefined);
    expect(sendEvent.mock.calls.map(([event]) => event.type)).toEqual([
      'message_start',
      'user_turn_undo',
    ]);
    expect(entry.lastCompletedTurnUndo).toBeNull();
  });
});
