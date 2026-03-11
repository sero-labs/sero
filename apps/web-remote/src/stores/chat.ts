/**
 * Chat store — messages, streaming state, and tool calls.
 */

import { create } from 'zustand';
import { useConnectionStore } from './connection';
import { useWorkspaceStore } from './workspace';
import type { GatewayMessage } from '@/lib/gateway-client';

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  text: string;
  isStreaming: boolean;
  thinking?: string;
  images?: Array<{ base64: string; mimeType: string }>;
  timestamp: number;
}

export interface ToolCall {
  toolCallId: string;
  toolName: string;
  input?: Record<string, unknown>;
  state: 'running' | 'done' | 'error';
  output?: string;
}

interface ChatStore {
  messages: ChatMessage[];
  toolCalls: ToolCall[];
  isStreaming: boolean;

  sendMessage: (text: string) => void;
  handleMessage: (msg: GatewayMessage) => void;
  clearMessages: () => void;
}

let msgCounter = 0;

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  toolCalls: [],
  isStreaming: false,

  sendMessage: (text: string) => {
    const { activeWorkspaceId, activeSessionId } = useWorkspaceStore.getState();
    if (!activeWorkspaceId) return;

    // Generate session ID if none selected
    const sessionId = activeSessionId ?? `web-${Date.now()}`;
    if (!activeSessionId) {
      useWorkspaceStore.setState({ activeSessionId: sessionId });
    }

    // Optimistic user message
    const userMsg: ChatMessage = {
      id: `msg-${++msgCounter}`,
      type: 'user',
      text,
      isStreaming: false,
      timestamp: Date.now(),
    };
    set((s) => ({ messages: [...s.messages, userMsg] }));

    // Send to gateway
    const client = useConnectionStore.getState().client;
    client.sendPrompt(activeWorkspaceId, sessionId, text);
  },

  handleMessage: (msg: GatewayMessage) => {
    const pushMsg = msg as Record<string, unknown>;

    switch (pushMsg.type) {
      case 'agent_start': {
        set({ isStreaming: true });
        break;
      }

      case 'agent_end': {
        // Finalize any streaming assistant message
        set((s) => ({
          isStreaming: false,
          messages: s.messages.map((m) =>
            m.isStreaming ? { ...m, isStreaming: false } : m,
          ),
        }));
        break;
      }

      case 'text_delta': {
        const delta = pushMsg.delta as string;
        set((s) => {
          const msgs = [...s.messages];
          const last = msgs[msgs.length - 1];

          if (last && last.type === 'assistant' && last.isStreaming) {
            // Append to existing streaming message
            msgs[msgs.length - 1] = { ...last, text: last.text + delta };
          } else {
            // Start a new assistant message
            msgs.push({
              id: `msg-${++msgCounter}`,
              type: 'assistant',
              text: delta,
              isStreaming: true,
              timestamp: Date.now(),
            });
          }

          return { messages: msgs };
        });
        break;
      }

      case 'thinking_delta': {
        const delta = pushMsg.delta as string;
        set((s) => {
          const msgs = [...s.messages];
          const last = msgs[msgs.length - 1];

          if (last && last.type === 'assistant' && last.isStreaming) {
            msgs[msgs.length - 1] = {
              ...last,
              thinking: (last.thinking ?? '') + delta,
            };
          } else {
            msgs.push({
              id: `msg-${++msgCounter}`,
              type: 'assistant',
              text: '',
              isStreaming: true,
              thinking: delta,
              timestamp: Date.now(),
            });
          }

          return { messages: msgs };
        });
        break;
      }

      case 'tool_start': {
        const toolCall: ToolCall = {
          toolCallId: pushMsg.toolCallId as string,
          toolName: pushMsg.toolName as string,
          input: pushMsg.input as Record<string, unknown> | undefined,
          state: 'running',
        };
        set((s) => ({ toolCalls: [...s.toolCalls, toolCall] }));
        break;
      }

      case 'tool_end': {
        const callId = pushMsg.toolCallId as string;
        const isError = pushMsg.isError as boolean;
        const output = pushMsg.output as string | null;

        set((s) => ({
          toolCalls: s.toolCalls.map((tc) =>
            tc.toolCallId === callId
              ? { ...tc, state: isError ? 'error' : 'done', output: output ?? undefined }
              : tc,
          ),
        }));
        break;
      }
    }
  },

  clearMessages: () => {
    set({ messages: [], toolCalls: [], isStreaming: false });
  },
}));
