/**
 * Chat panel — message list, streaming state, and prompt input.
 */

import { useState, useRef, useCallback } from 'react';
import { useChatStore } from '@/stores/chat';
import { useWorkspaceStore } from '@/stores/workspace';
import { useConnectionStore } from '@/stores/connection';
import { ChatMessageComponent } from './ChatMessage';
import { ToolCallDisplay } from './ToolCallDisplay';
import { cn } from '@/lib/cn';
import { Send, Square, ArrowDown } from 'lucide-react';

export function ChatPanel() {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const messages = useChatStore((s) => s.messages);
  const toolCalls = useChatStore((s) => s.toolCalls);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const connectionState = useConnectionStore((s) => s.state);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeSessionId = useWorkspaceStore((s) => s.activeSessionId);
  const client = useConnectionStore((s) => s.client);

  const isConnected = connectionState === 'connected';
  const canSend = isConnected && !!activeWorkspaceId && !isStreaming;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    setShowScrollButton(scrollHeight - scrollTop - clientHeight > 100);
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !canSend) return;
    sendMessage(text);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    // Auto-scroll on send
    setTimeout(scrollToBottom, 50);
  }, [input, canSend, sendMessage, scrollToBottom]);

  const handleAbort = useCallback(() => {
    if (activeSessionId) {
      client.abortSession(activeSessionId);
    }
  }, [activeSessionId, client]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleTextareaInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  // Group consecutive tool calls between messages
  const renderItems: Array<{ type: 'message'; index: number } | { type: 'tools'; ids: string[] }> = [];
  let pendingToolIds: string[] = [];

  for (let i = 0; i < messages.length; i++) {
    // Flush any pending tool calls before user messages
    if (messages[i].type === 'user' && pendingToolIds.length > 0) {
      renderItems.push({ type: 'tools', ids: [...pendingToolIds] });
      pendingToolIds = [];
    }
    renderItems.push({ type: 'message', index: i });
  }

  // Add any remaining tool calls
  if (toolCalls.length > 0) {
    renderItems.push({
      type: 'tools',
      ids: toolCalls.map((tc) => tc.toolCallId),
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-2"
      >
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <p className="text-lg font-medium">Sero Remote</p>
              <p className="text-sm mt-1">
                Send a message to start a conversation
              </p>
            </div>
          </div>
        )}

        {renderItems.map((item, idx) => {
          if (item.type === 'message') {
            return (
              <ChatMessageComponent
                key={messages[item.index].id}
                message={messages[item.index]}
              />
            );
          }
          const tcs = toolCalls.filter((tc) => item.ids.includes(tc.toolCallId));
          return <ToolCallDisplay key={`tools-${idx}`} toolCalls={tcs} />;
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollButton && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2">
          <button
            onClick={scrollToBottom}
            className="bg-card border border-border rounded-full p-2 shadow-lg hover:bg-accent transition-colors"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="px-4 py-3 border-t border-border bg-card">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleTextareaInput}
            placeholder={
              !isConnected
                ? 'Not connected...'
                : !activeWorkspaceId
                  ? 'Select a workspace first...'
                  : 'Send a message...'
            }
            disabled={!isConnected}
            rows={1}
            className={cn(
              'flex-1 bg-background border border-input rounded-lg px-3 py-2.5',
              'text-sm text-foreground placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
              'resize-none min-h-[42px] max-h-[120px]',
              'disabled:opacity-50',
              'font-[inherit]',
            )}
          />

          {isStreaming ? (
            <button
              onClick={handleAbort}
              className={cn(
                'shrink-0 rounded-lg p-2.5',
                'bg-destructive text-destructive-foreground',
                'hover:bg-destructive/90 transition-colors',
              )}
              title="Stop generation"
            >
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!canSend || !input.trim()}
              className={cn(
                'shrink-0 rounded-lg p-2.5',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
