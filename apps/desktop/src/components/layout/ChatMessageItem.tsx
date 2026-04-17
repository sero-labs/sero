import { memo, useMemo } from 'react';
import { Bot, Loader2, RotateCcw, User } from 'lucide-react';

import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '@sero-ai/ui/components/ai-elements/message';
import { cn } from '@sero-ai/ui/lib/utils';
import { MessageAttachments } from './ChatAttachments';
import { ThinkingBlock } from './ThinkingBlock';
import { MemoryContextBlock } from './MemoryContextBlock';
import { ResponseFeedback } from './ResponseFeedback';
import type { ChatMessage, ChatTurnUndoRef } from '@/types/ipc';

function ChatAvatar({ kind }: { kind: 'user' | 'assistant' }) {
  const Icon = kind === 'user' ? User : Bot;
  return (
    <div
      aria-hidden
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--accent-primary)]',
        // Align avatar centre with first-line-centre of the adjacent text.
        // User bubble has py-3 (12px) top padding → nudge down; assistant text
        // is flush to the top → nudge up by ~2px so the 24px circle centres on
        // the 20px line-height.
        kind === 'user' ? 'mt-2.5' : '-mt-px',
      )}
    >
      <Icon className="size-3.5" />
    </div>
  );
}

interface ChatMessageItemProps {
  message: ChatMessage;
  /** Whether to display thinking/reasoning blocks. */
  showThinking?: boolean;
  /** Whether to display memory context blocks. */
  showMemory?: boolean;
  onRestoreTurnUndo?: (turnUndo: ChatTurnUndoRef) => void;
  /** Session ID for feedback attribution. */
  sessionId?: string;
  /** The user message text that preceded this assistant response. */
  previousUserText?: string;
}

export const ChatMessageItem = memo(function ChatMessageItem({
  message,
  showThinking,
  showMemory,
  onRestoreTurnUndo,
  sessionId,
  previousUserText,
}: ChatMessageItemProps) {
  switch (message.type) {
    case 'user': {
      const turnUndo = message.turnUndo;
      const canRestore = !!turnUndo && !!onRestoreTurnUndo;

      return (
        <Message from="user">
          <div className="ml-auto flex w-fit max-w-full items-start gap-2">
            <div className="relative min-w-0">
              <MessageContent
                className={cn(
                  'group-[.is-user]:bg-[var(--bg-elevated)]',
                  canRestore && 'pr-8',
                )}
              >
                <MessageResponse>{message.text}</MessageResponse>
                {message.attachments?.length ? (
                  <MessageAttachments attachments={message.attachments} />
                ) : null}
              </MessageContent>

              {canRestore && turnUndo && onRestoreTurnUndo ? (
                <MessageActions className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2">
                  <MessageAction
                    tooltip="Revert to this point"
                    label="Revert to this point"
                    className="h-7 w-7 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] shadow-sm hover:text-[var(--text-primary)]"
                    onClick={() => onRestoreTurnUndo(turnUndo)}
                  >
                    <RotateCcw className="size-3.5" />
                  </MessageAction>
                </MessageActions>
              ) : null}
            </div>
            <ChatAvatar kind="user" />
          </div>
        </Message>
      );
    }

    case 'assistant': {
      const isDone = !message.isStreaming;
      const hasContent = !!message.text?.trim();
      const showFeedback = isDone && hasContent && !!sessionId;

      // Truncate excerpts for storage (keep feedback entries lean)
      const promptExcerpt = useMemo(
        () => previousUserText?.slice(0, 300),
        [previousUserText],
      );
      const responseExcerpt = useMemo(
        () => message.text?.slice(0, 300),
        [message.text],
      );

      return (
        <Message from="assistant" className="group/msg flex-row items-start gap-2">
          <ChatAvatar kind="assistant" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {showMemory && message.memoryContext && (
              <MemoryContextBlock context={message.memoryContext} />
            )}
            {showThinking && message.thinking && (
              <ThinkingBlock
                thinking={message.thinking}
                isStreaming={message.isStreaming && !message.text}
              />
            )}
            <MessageContent>
              <MessageResponse>{message.text}</MessageResponse>
              {message.isStreaming && message.text === '' && !message.thinking && (
                <Loader2 className="size-4 animate-spin text-[var(--text-muted)]" />
              )}
            </MessageContent>
            {showFeedback && (
              <ResponseFeedback
                messageId={message.id}
                sessionId={sessionId}
                promptExcerpt={promptExcerpt}
                responseExcerpt={responseExcerpt}
              />
            )}
          </div>
        </Message>
      );
    }

    default:
      return null;
  }
});
