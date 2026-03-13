/**
 * Chat panel — message list, streaming state, prompt input with image support.
 */

import { useState, useRef, useCallback } from 'react';
import { useChatStore } from '@/stores/chat';
import { useWorkspaceStore } from '@/stores/workspace';
import { useConnectionStore } from '@/stores/connection';
import { ChatMessageComponent } from './ChatMessage';
import { ToolCallDisplay } from './ToolCallDisplay';
import { cn } from '@/lib/cn';
import { Send, Square, ArrowDown, Paperclip, X } from 'lucide-react';

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
  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

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

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    setShowScrollButton(scrollHeight - scrollTop - clientHeight > 100);
  }, []);

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
    setTimeout(scrollToBottom, 50);
  }, [input, canSend, sendMessage, scrollToBottom, pendingImages]);

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
      // Reset the input so the same file can be selected again
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

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-2"
      >
        {messages.length === 0 && !isLoadingHistory && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <p className="text-lg font-medium">Sero Remote</p>
              <p className="text-sm mt-1">
                Send a message to start a conversation
              </p>
            </div>
          </div>
        )}

        {isLoadingHistory && messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <p className="text-sm">Loading conversation...</p>
            </div>
          </div>
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
                    'bg-destructive text-destructive-foreground',
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
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!isConnected}
            className={cn(
              'shrink-0 rounded-lg p-2.5',
              'text-muted-foreground hover:text-foreground transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            title="Attach image"
          >
            <Paperclip className="w-4 h-4" />
          </button>

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
              disabled={!canSend}
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
