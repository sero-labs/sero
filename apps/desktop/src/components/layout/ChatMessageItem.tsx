import { memo, useMemo } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';

import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '@sero/ui/components/ai-elements/message';
import { MessageAttachments } from './ChatAttachments';
import { ThinkingBlock } from './ThinkingBlock';
import { MemoryContextBlock } from './MemoryContextBlock';
import { ResponseFeedback } from './ResponseFeedback';
import type { ChatMessage } from '@/types/ipc';
import type { ChatCheckpointRef } from '@/types/checkpoints';

interface ChatMessageItemProps {
  message: ChatMessage;
  /** Whether to display thinking/reasoning blocks. */
  showThinking?: boolean;
  /** Whether to display memory context blocks. */
  showMemory?: boolean;
  onRestoreCheckpoint?: (checkpoint: ChatCheckpointRef) => void;
  /** Session ID for feedback attribution. */
  sessionId?: string;
  /** The user message text that preceded this assistant response. */
  previousUserText?: string;
}

export const ChatMessageItem = memo(function ChatMessageItem({
  message,
  showThinking,
  showMemory,
  onRestoreCheckpoint,
  sessionId,
  previousUserText,
}: ChatMessageItemProps) {
  switch (message.type) {
    case 'user': {
      const checkpoint = (message as { checkpoint?: ChatCheckpointRef }).checkpoint;
      const canRestore = !!checkpoint && !!onRestoreCheckpoint;

      return (
        <Message from="user">
          <div className="relative ml-auto w-fit max-w-full">
            <MessageContent className={canRestore ? 'pr-8' : undefined}>
              <MessageResponse>{message.text}</MessageResponse>
              {message.attachments?.length ? (
                <MessageAttachments attachments={message.attachments} />
              ) : null}
            </MessageContent>

            {canRestore && checkpoint && onRestoreCheckpoint ? (
              <MessageActions className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2">
                <MessageAction
                  tooltip="Revert to this point"
                  label="Revert to this point"
                  className="h-7 w-7 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] shadow-sm hover:text-[var(--text-primary)]"
                  onClick={() => onRestoreCheckpoint(checkpoint)}
                >
                  <RotateCcw className="size-3.5" />
                </MessageAction>
              </MessageActions>
            ) : null}
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
        <Message from="assistant" className="group/msg">
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
        </Message>
      );
    }

    default:
      return null;
  }
});
