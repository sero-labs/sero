import { Loader2, RotateCcw } from 'lucide-react';

import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import { MessageAttachments } from './ChatAttachments';
import type { ChatMessage } from '@/types/ipc';
import type { ChatCheckpointRef } from '@/types/checkpoints';

interface ChatMessageItemProps {
  message: ChatMessage;
  onRestoreCheckpoint?: (checkpoint: ChatCheckpointRef) => void;
}

export function ChatMessageItem({
  message,
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
          <MessageContent>
            <MessageResponse>{message.text}</MessageResponse>
            {message.isStreaming && message.text === '' && (
              <Loader2 className="size-4 animate-spin text-[var(--text-muted)]" />
            )}
          </MessageContent>
        </Message>
      );

    default:
      return null;
  }
}
