import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatAttachment, AgentStreamEvent } from '../../../src/types/ipc';
import type { ChatCheckpointRef } from '../../../src/types/checkpoints';
import { workspaceManager } from '../../shared/infra/shared-infra';
import {
  executeDirectCliPrompt,
  handlePromptInput,
  isDirectSeroCliPrompt,
  type PromptPoolEntry,
} from '../../ipc/agent/core/agent-prompt';

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
      lastCompletedCheckpoint: null,
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

  it('uses the normal agent prompt path for non-sero text and preserves checkpoints', async () => {
    const prompt = vi.fn();
    const sendEvent = vi.fn<(event: AgentStreamEvent) => void>();
    const checkpoint: ChatCheckpointRef = {
      changeId: 'cp-1',
      description: 'checkpoint',
      source: 'turn',
      createdAt: '2026-04-01T10:00:00.000Z',
    };

    const entry: PromptPoolEntry = {
      workspaceId: 'ws-1',
      lastCompletedCheckpoint: checkpoint,
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
      'user_checkpoint',
    ]);
    expect(entry.lastCompletedCheckpoint).toBeNull();
  });
});
