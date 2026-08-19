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
  /** Tool calls attached to this message (populated after agent_end or from history). */
  toolCalls?: ToolCall[];
  timestamp: number;
}

export interface ToolCall {
  toolCallId: string;
  /** Stable React key while a streamed placeholder adopts its real call id. */
  renderKey?: string;
  toolName: string;
  input?: Record<string, unknown>;
  state: 'streaming' | 'running' | 'done' | 'error' | 'cancelled';
  /** True while the model is still streaming this call's arguments. */
  isStreamingInput?: boolean;
  output?: string;
  /** Images returned by this tool call (e.g. screenshots). */
  images?: Array<{ data: string; mimeType: string; description?: string }>;
}

/** A reference to tool calls between messages — used for interleaved display. */
export interface ToolCallGroup {
  id: string;
  toolCalls: ToolCall[];
}

/** A render item: either a message or an inline tool call group. */
export type ChatRenderItem =
  | { type: 'message'; message: ChatMessage }
  | { type: 'tools'; group: ToolCallGroup };

interface ChatStore {
  messages: ChatMessage[];
  toolCalls: ToolCall[];
  /** Ordered render items (messages + interleaved tool groups). */
  renderItems: ChatRenderItem[];
  isStreaming: boolean;
  isLoadingHistory: boolean;
  /** Text waiting to be inserted into the composer (e.g. a preview element grab). */
  composerPrefill: string | null;

  setComposerPrefill: (text: string) => void;
  clearComposerPrefill: () => void;
  sendMessage: (text: string, images?: Array<{ data: string; mimeType: string }>) => void;
  handleMessage: (msg: GatewayMessage) => void;
  clearMessages: () => void;
  loadHistory: (workspaceId: string, sessionId: string) => void;
  /** Rebuild render items from messages and tool calls. */
  _rebuildRenderItems: () => void;
}

let msgCounter = 0;

/** Build interleaved render items from messages and active tool calls. */
function buildRenderItems(
  messages: ChatMessage[],
  toolCalls: ToolCall[],
): ChatRenderItem[] {
  const items: ChatRenderItem[] = [];

  for (const msg of messages) {
    // Render tool calls attached to this message inline
    if (msg.type === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      items.push({ type: 'message', message: msg });
      items.push({
        type: 'tools',
        group: { id: `tg-${msg.id}`, toolCalls: msg.toolCalls },
      });
    } else {
      items.push({ type: 'message', message: msg });
    }
  }

  // Any active (streaming) tool calls not yet attached to a message
  const attachedIds = new Set(
    messages.flatMap((m) => m.toolCalls?.map((tc) => tc.toolCallId) ?? []),
  );
  const unattached = toolCalls.filter((tc) => !attachedIds.has(tc.toolCallId));
  if (unattached.length > 0) {
    items.push({
      type: 'tools',
      group: { id: `tg-active`, toolCalls: unattached },
    });
  }

  return items;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  toolCalls: [],
  renderItems: [],
  isStreaming: false,
  isLoadingHistory: false,
  composerPrefill: null,

  setComposerPrefill: (text) => set({ composerPrefill: text }),
  clearComposerPrefill: () => set({ composerPrefill: null }),

  _rebuildRenderItems: () => {
    const { messages, toolCalls } = get();
    set({ renderItems: buildRenderItems(messages, toolCalls) });
  },

  sendMessage: (text: string, images?: Array<{ data: string; mimeType: string }>) => {
    const { activeWorkspaceId, activeSessionId } = useWorkspaceStore.getState();
    if (!activeWorkspaceId) return;

    const sessionId = activeSessionId ?? `web-${Date.now()}`;
    if (!activeSessionId) {
      useWorkspaceStore.setState({ activeSessionId: sessionId });
    }

    const userMsg: ChatMessage = {
      id: `msg-${++msgCounter}`,
      type: 'user',
      text,
      isStreaming: false,
      images: images?.map((img) => ({ base64: img.data, mimeType: img.mimeType })),
      timestamp: Date.now(),
    };
    set((s) => ({ messages: [...s.messages, userMsg] }));
    get()._rebuildRenderItems();

    const client = useConnectionStore.getState().client;
    client.sendPrompt(activeWorkspaceId, sessionId, text, images);
  },

  loadHistory: (workspaceId: string, sessionId: string) => {
    set({ isLoadingHistory: true });
    const client = useConnectionStore.getState().client;
    client.requestSessionHistory(workspaceId, sessionId);
  },

  handleMessage: (msg: GatewayMessage) => {
    const pushMsg = msg as Record<string, unknown>;

    // Handle history response
    if (pushMsg.type === 'ok' && pushMsg.requestType === 'get_session_history') {
      const historyData = pushMsg.data as Array<{
        id: string;
        type: 'user' | 'assistant' | 'system';
        text: string;
        thinking?: string;
        images?: Array<{ base64: string; mimeType: string }>;
        toolCalls?: Array<{
          toolCallId: string;
          toolName: string;
          state: 'done' | 'error';
          output?: string;
          images?: Array<{ data: string; mimeType: string; description?: string }>;
        }>;
        timestamp: number;
      }> | null;
      if (historyData) {
        const messages: ChatMessage[] = historyData.map((m) => ({
          id: m.id || `msg-${++msgCounter}`,
          type: m.type,
          text: m.text,
          isStreaming: false,
          thinking: m.thinking,
          images: m.images,
          toolCalls: m.toolCalls,
          timestamp: m.timestamp,
        }));
        set({ messages, toolCalls: [], isStreaming: false, isLoadingHistory: false });
        get()._rebuildRenderItems();
      } else {
        set({ isLoadingHistory: false });
      }
      return;
    }

    switch (pushMsg.type) {
      case 'agent_start': {
        set({ isStreaming: true });
        break;
      }

      case 'agent_end': {
        // Finalize streaming: attach any unattached tool calls to the last assistant message
        set((s) => {
          const msgs = [...s.messages];
          const last = msgs[msgs.length - 1];
          const finalizedToolCalls = s.toolCalls.map((toolCall) =>
            toolCall.state === 'streaming' || toolCall.state === 'running'
              ? { ...toolCall, state: 'cancelled' as const, isStreamingInput: false }
              : toolCall,
          );
          if (last && last.type === 'assistant' && last.isStreaming) {
            msgs[msgs.length - 1] = {
              ...last,
              isStreaming: false,
              toolCalls: finalizedToolCalls.length > 0 ? finalizedToolCalls : last.toolCalls,
            };
          }
          return { isStreaming: false, messages: msgs, toolCalls: [] };
        });
        get()._rebuildRenderItems();
        break;
      }

      case 'text_delta': {
        const delta = pushMsg.delta as string;
        set((s) => {
          const msgs = [...s.messages];
          const last = msgs[msgs.length - 1];

          if (last && last.type === 'assistant' && last.isStreaming) {
            msgs[msgs.length - 1] = { ...last, text: last.text + delta };
          } else {
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
        get()._rebuildRenderItems();
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
        get()._rebuildRenderItems();
        break;
      }

      case 'tool_input_start': {
        // The card appears before the tool runs, keyed by the stream until the
        // real tool call id arrives.
        const toolCall: ToolCall = {
          toolCallId: pushMsg.streamKey as string,
          renderKey: pushMsg.streamKey as string,
          toolName: pushMsg.toolName as string,
          input: {},
          state: 'streaming',
          isStreamingInput: true,
        };
        set((s) => ({ toolCalls: [...s.toolCalls, toolCall] }));
        get()._rebuildRenderItems();
        break;
      }

      case 'tool_input_delta': {
        const streamKey = pushMsg.streamKey as string;
        const delta = pushMsg.delta as string;
        const replace = pushMsg.replace as boolean;
        const path = pushMsg.path as string | null;

        set((s) => ({
          toolCalls: s.toolCalls.map((tc) => {
            if (tc.toolCallId !== streamKey) return tc;
            const previous = typeof tc.input?.content === 'string' ? tc.input.content : '';
            return {
              ...tc,
              input: {
                ...tc.input,
                ...(path ? { path } : {}),
                content: replace ? delta : previous + delta,
              },
            };
          }),
        }));
        get()._rebuildRenderItems();
        break;
      }

      case 'tool_input_end': {
        const streamKey = pushMsg.streamKey as string;
        const toolCallId = pushMsg.toolCallId as string;
        set((s) => ({
          toolCalls: s.toolCalls.map((tc) =>
            tc.toolCallId === streamKey ? { ...tc, toolCallId, isStreamingInput: false } : tc,
          ),
        }));
        get()._rebuildRenderItems();
        break;
      }

      case 'tool_start': {
        const toolCallId = pushMsg.toolCallId as string;
        const toolCall: ToolCall = {
          toolCallId,
          toolName: pushMsg.toolName as string,
          input: pushMsg.input as Record<string, unknown> | undefined,
          state: 'running',
        };
        // The card may already exist from the argument stream.
        set((s) => (
          s.toolCalls.some((tc) => tc.toolCallId === toolCallId)
            ? {
                toolCalls: s.toolCalls.map((tc) =>
                  tc.toolCallId === toolCallId
                    ? { ...tc, ...toolCall, isStreamingInput: false }
                    : tc,
                ),
              }
            : { toolCalls: [...s.toolCalls, toolCall] }
        ));
        get()._rebuildRenderItems();
        break;
      }

      case 'tool_end': {
        const callId = pushMsg.toolCallId as string;
        const isError = pushMsg.isError as boolean;
        const output = pushMsg.output as string | null;
        const images = pushMsg.images as Array<{ data: string; mimeType: string; description?: string }> | undefined;

        set((s) => ({
          toolCalls: s.toolCalls.map((tc) =>
            tc.toolCallId === callId
              ? {
                  ...tc,
                  state: isError ? 'error' : 'done',
                  isStreamingInput: false,
                  output: output ?? undefined,
                  images,
                }
              : tc,
          ),
        }));
        get()._rebuildRenderItems();
        break;
      }
    }
  },

  clearMessages: () => {
    set({ messages: [], toolCalls: [], renderItems: [], isStreaming: false });
  },
}));
