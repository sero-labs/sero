/**
 * Chat panel — message list, streaming state, prompt input with image support.
 *
 * Uses Conversation/ConversationContent/ConversationScrollButton from @sero-ai/ui
 * for automatic stick-to-bottom scrolling (same component the desktop app uses).
 */

import { useState, useRef, useCallback } from 'react';
import { useChatStore } from '@/stores/chat';
import { useWorkspaceStore } from '@/stores/workspace';
import { useConnectionStore } from '@/stores/connection';
import { ChatMessageComponent } from './ChatMessage';
import { ToolCallDisplay } from './ToolCallDisplay';
import { VoiceTranscriptionControl } from './VoiceTranscriptionControl';
import { cn } from '@sero-ai/ui/lib/utils';
import { Button } from '@sero-ai/ui/components/ui/button';
import { useIsMobile } from '@sero-ai/ui/hooks/use-mobile';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationEmptyState,
} from '@sero-ai/ui/components/ai-elements/conversation';
import { Send, Square, Paperclip, X, MessageSquare } from 'lucide-react';

interface PendingImage {
  data: string;
  mimeType: string;
  preview: string;
}

/** Read a File as base64 data URL. */
function readFileAsBase64(file: File): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({ data: base64, mimeType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ChatPanel() {
  const isMobile = useIsMobile();
  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messages = useChatStore((s) => s.messages);
  const renderItems = useChatStore((s) => s.renderItems);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const isLoadingHistory = useChatStore((s) => s.isLoadingHistory);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const connectionState = useConnectionStore((s) => s.state);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeSessionId = useWorkspaceStore((s) => s.activeSessionId);
  const client = useConnectionStore((s) => s.client);

  const isConnected = connectionState === 'connected';
  const hasContent = input.trim().length > 0 || pendingImages.length > 0;
  const canSend = isConnected && !!activeWorkspaceId && !isStreaming && hasContent;

  const addImages = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    const newImages: PendingImage[] = [];
    for (const file of imageFiles) {
      const { data, mimeType } = await readFileAsBase64(file);
      newImages.push({
        data,
        mimeType,
        preview: URL.createObjectURL(file),
      });
    }
    setPendingImages((prev) => [...prev, ...newImages]);
  }, []);

  const removeImage = useCallback((index: number) => {
    setPendingImages((prev) => {
      const copy = [...prev];
      URL.revokeObjectURL(copy[index].preview);
      copy.splice(index, 1);
      return copy;
    });
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!canSend) return;
    const images = pendingImages.length > 0
      ? pendingImages.map((img) => ({ data: img.data, mimeType: img.mimeType }))
      : undefined;
    sendMessage(text || '(image)', images);
    setInput('');
    setPendingImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.preview));
      return [];
    });
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, canSend, sendMessage, pendingImages]);

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

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        addImages(imageFiles);
      }
    },
    [addImages],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) addImages(files);
      e.target.value = '';
    },
    [addImages],
  );

  const handleTextareaInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const handleTranscript = useCallback((text: string) => {
    const transcript = text.trim();
    if (!transcript) return;
    setInput((prev) => {
      if (!prev.trim()) return transcript;
      return `${prev}${prev.endsWith('\n') ? '' : '\n'}${transcript}`;
    });
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    });
  }, []);

  const isEmpty = messages.length === 0 && !isLoadingHistory;

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable conversation — StickToBottom handles auto-scroll */}
      <Conversation
        key={activeSessionId ?? '__empty'}
        className="min-h-0 flex-1"
        initial="instant"
      >
        <ConversationContent className="gap-2 px-4 py-2">
          {isEmpty && (
            <ConversationEmptyState
              icon={<MessageSquare className="size-8" />}
              title="Sero Remote"
              description="Send a message to start a conversation"
            />
          )}

          {isLoadingHistory && messages.length === 0 && (
            <ConversationEmptyState
              title="Loading conversation..."
              description=""
            />
          )}

          {renderItems.map((item) => {
            if (item.type === 'message') {
              return (
                <ChatMessageComponent
                  key={item.message.id}
                  message={item.message}
                />
              );
            }
            return (
              <ToolCallDisplay
                key={item.group.id}
                toolCalls={item.group.toolCalls}
              />
            );
          })}
        </ConversationContent>

        <ConversationScrollButton />
      </Conversation>

      {/* Input area — pinned below the conversation */}
      <div className="shrink-0 px-4 py-3 border-t border-border bg-card">
        {/* Pending image thumbnails */}
        {pendingImages.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {pendingImages.map((img, i) => (
              <div key={i} className="relative group">
                <img
                  src={img.preview}
                  alt={`Attachment ${i + 1}`}
                  className="w-16 h-16 object-cover rounded-md border border-border"
                />
                <button
                  onClick={() => removeImage(i)}
                  className={cn(
                    'absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full',
                    'bg-destructive text-white',
                    'flex items-center justify-center',
                    'opacity-0 group-hover:opacity-100 transition-opacity',
                  )}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Attach button */}
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={!isConnected}
            variant="ghost"
            size="icon"
            title="Attach image"
          >
            <Paperclip className="size-4" />
          </Button>

          <VoiceTranscriptionControl
            client={client}
            isConnected={isConnected}
            disabled={!isConnected || isStreaming}
            onTranscript={handleTranscript}
          />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onInput={handleTextareaInput}
            placeholder={
              !isConnected
                ? 'Not connected...'
                : !activeWorkspaceId
                  ? 'Select a workspace first...'
                  : isMobile
                    ? 'Send a message...'
                    : 'Send a message... (paste images with ⌘V)'
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
            <Button
              onClick={handleAbort}
              variant="destructive"
              size="icon"
              title="Stop generation"
            >
              <Square className="size-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={!canSend}
              size="icon"
              title="Send message"
            >
              <Send className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
