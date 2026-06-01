/**
 * Chat message renderer, handles user, assistant, and system messages
 * with markdown rendering, code highlighting, thinking blocks, and
 * image lightbox support.
 */

import { useState, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { cn } from '@sero-ai/ui/lib/utils';
import { ChevronDown, ChevronRight, User, Bot, Brain } from 'lucide-react';
import { ImageLightbox } from './ImageLightbox';
import type { ChatMessage as ChatMessageType } from '@/stores/chat';

interface ChatMessageProps {
  message: ChatMessageType;
}

const ThinkingBlock = memo(function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-2">
      <button type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        <Brain className="size-3" />
        Thinking…
      </button>
      {expanded && (
        <div className="mt-1 pl-4 border-l-2 border-muted text-xs text-muted-foreground whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  );
});

export const ChatMessageComponent = memo(function ChatMessageComponent({
  message,
}: ChatMessageProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  if (message.type === 'system') {
    return (
      <div className="text-center text-xs text-muted-foreground py-1">
        {message.text}
      </div>
    );
  }

  const isUser = message.type === 'user';

  return (
    <div
      className={cn(
        'flex gap-3 py-2',
        isUser ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'size-7 rounded-full flex items-center justify-center shrink-0',
          isUser ? 'bg-primary/20' : 'bg-accent',
        )}
      >
        {isUser ? (
          <User className="size-4 text-primary" />
        ) : (
          <Bot className="size-4 text-foreground" />
        )}
      </div>

      {/* Message content */}
      <div className={cn('max-w-[80%] min-w-0', isUser ? 'text-right' : '')}>
        {/* Thinking block */}
        {message.thinking && <ThinkingBlock text={message.thinking} />}

        {/* Message text */}
        {message.text && (
          <div
            className={cn(
              'rounded-lg px-3 py-2 text-sm',
              isUser
                ? 'bg-primary text-primary-foreground inline-block text-left'
                : 'bg-card border border-border',
            )}
          >
            {isUser ? (
              <span className="whitespace-pre-wrap">{message.text}</span>
            ) : (
              <div className="prose prose-invert prose-sm max-w-none [&_pre]:bg-background [&_pre]:border [&_pre]:border-border [&_pre]:rounded-md [&_code]:text-xs">
                <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                  {message.text}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Inline images, click to open lightbox */}
        {message.images && message.images.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.images.map((img, i) => {
              const src = `data:${img.mimeType};base64,${img.base64}`;
              return (
                <button type="button"
                  key={src}
                  onClick={() => setLightboxSrc(src)}
                  className="cursor-zoom-in"
                >
                  <img
                    src={src}
                    alt={`Attachment ${i + 1}`}
                    className="max-w-full max-h-[300px] rounded-lg border border-border object-contain hover:border-primary/50 transition-colors"
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Streaming cursor */}
        {message.isStreaming && (
          <span className="inline-block w-2 h-4 bg-primary/60 animate-pulse ml-0.5 align-text-bottom" />
        )}
      </div>

      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          alt="Message image"
          onClose={() => setLightboxSrc(null)}
        />
      )}
    </div>
  );
});
