/**
 * Chat message renderer — handles user, assistant, and system messages
 * with markdown rendering, code highlighting, and thinking blocks.
 */

import { useState, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { cn } from '@/lib/cn';
import { ChevronDown, ChevronRight, User, Bot, Brain } from 'lucide-react';
import type { ChatMessage as ChatMessageType } from '@/stores/chat';

interface ChatMessageProps {
  message: ChatMessageType;
}

const ThinkingBlock = memo(function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        <Brain className="w-3 h-3" />
        Thinking...
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
          'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
          isUser ? 'bg-primary/20' : 'bg-accent',
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-primary" />
        ) : (
          <Bot className="w-4 h-4 text-foreground" />
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

        {/* Inline images */}
        {message.images?.map((img, i) => (
          <img
            key={i}
            src={`data:${img.mimeType};base64,${img.base64}`}
            alt="Attachment"
            className="mt-2 max-w-full rounded-lg border border-border"
          />
        ))}

        {/* Streaming cursor */}
        {message.isStreaming && (
          <span className="inline-block w-2 h-4 bg-primary/60 animate-pulse ml-0.5 align-text-bottom" />
        )}
      </div>
    </div>
  );
});
