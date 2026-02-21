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
import type { ChatMessage } from '@/types/ipc';
import type { ChatCheckpointRef } from '@/types/checkpoints';

interface ChatMessageItemProps {
  message: ChatMessage;
  /** Whether to display thinking/reasoning blocks. */
  showThinking?: boolean;
  onRestoreCheckpoint?: (checkpoint: ChatCheckpointRef) => void;
}

export function ChatMessageItem({
  message,
  showThinking,
  onRestoreCheckpoint,
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

    case 'assistant':
      return (
        <Message from="assistant">
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
        </Message>
      );

    default:
      return null;
  }
}
