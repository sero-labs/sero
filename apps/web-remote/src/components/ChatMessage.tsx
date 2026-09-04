/**
 * Chat message renderer — copies the desktop `ChatMessageItem` layout.
 *
 * User messages sit right, in a `bg-elevated` bubble. Assistant messages
 * run full width with no bubble. Markdown goes through `MessageResponse`
 * (Streamdown) on both sides. Thinking uses `Reasoning`, which opens
 * while it streams and closes when it settles.
 */

import { memo, useState } from 'react';
import { Bot, User } from 'lucide-react';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@sero-ai/ui/ai-elements/message';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@sero-ai/ui/ai-elements/reasoning';
import { cn } from '@sero-ai/ui/lib/utils';
import { ImageLightbox } from './ImageLightbox';
import type { ChatMessage as ChatMessageType } from '@/stores/chat';

interface ChatMessageProps {
  message: ChatMessageType;
}

function ChatAvatar({ kind }: { kind: 'user' | 'assistant' }) {
  const Icon = kind === 'user' ? User : Bot;
  return (
    <div
      aria-hidden
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--accent-primary)]',
        // Centre the 24px circle on the first line of the adjacent text.
        kind === 'user' ? 'mt-2.5' : '-mt-px',
      )}
    >
      <Icon className="size-3.5" />
    </div>
  );
}

/** Images the user attached or the agent returned, with a lightbox. */
function MessageImages({
  images,
}: {
  images: Array<{ base64: string; mimeType: string }>;
}) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {images.map((image, index) => {
          const src = `data:${image.mimeType};base64,${image.base64}`;
          return (
            <button
              type="button"
              key={src}
              onClick={() => setLightboxSrc(src)}
              className="cursor-zoom-in"
            >
              <img
                src={src}
                alt={`Attachment ${index + 1}`}
                className="max-h-[300px] max-w-full rounded-lg border border-[var(--border-subtle)] object-contain transition-colors hover:border-[var(--border-focus)]"
              />
            </button>
          );
        })}
      </div>

      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          alt="Message image"
          onClose={() => setLightboxSrc(null)}
        />
      )}
    </>
  );
}

export const ChatMessageComponent = memo(function ChatMessageComponent({
  message,
}: ChatMessageProps) {
  if (message.type === 'system') {
    return (
      <div className="py-1 text-center text-xs text-[var(--text-muted)]">
        {message.text}
      </div>
    );
  }

  const images = message.images ?? [];

  if (message.type === 'user') {
    return (
      <Message from="user">
        <div className="ml-auto flex w-fit max-w-full items-start gap-2">
          <div className="flex min-w-0 flex-col gap-2">
            {message.text && (
              <MessageContent className="group-[.is-user]:bg-[var(--bg-elevated)]">
                <MessageResponse>{message.text}</MessageResponse>
              </MessageContent>
            )}
            {images.length > 0 && <MessageImages images={images} />}
          </div>
          <ChatAvatar kind="user" />
        </div>
      </Message>
    );
  }

  const hasContent = !!message.text?.trim();

  return (
    <Message from="assistant" className="flex-row items-start gap-2">
      {hasContent && <ChatAvatar kind="assistant" />}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {message.thinking && (
          <Reasoning isStreaming={message.isStreaming && !hasContent}>
            <ReasoningTrigger />
            <ReasoningContent>{message.thinking}</ReasoningContent>
          </Reasoning>
        )}

        {hasContent && (
          <MessageContent>
            <MessageResponse>{message.text}</MessageResponse>
          </MessageContent>
        )}

        {images.length > 0 && <MessageImages images={images} />}

        {message.isStreaming && !hasContent && (
          <span className="inline-block h-4 w-2 animate-pulse bg-[var(--accent-primary)]/60 align-text-bottom" />
        )}
      </div>
    </Message>
  );
});
