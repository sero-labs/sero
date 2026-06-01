import { memo, useCallback } from 'react';
import { Bot, Check, Copy, RotateCcw, User } from 'lucide-react';
import { useTransientFlag } from '@/components/apps/explorer/useTransientUiState';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';

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
import { ThinkingIndicator } from './ChatPanelHelpers';
import type { ChatMessage, ChatTurnUndoRef } from '@/types/ipc';

function UserCopyButton({ text }: { text: string }) {
  const [copied, showCopied] = useTransientFlag(2000);
  const handleCopy = useCallback(async () => {
    if (!(await copyTextToClipboard(text))) return;
    showCopied();
  }, [text, showCopied]);

  return (
    <div
      className={cn(
        'ml-auto flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/msg:opacity-100 focus-within:opacity-100',
        copied && 'opacity-100',
      )}
    >
      <button
        type="button"
        aria-label="Copy message to clipboard"
        onClick={handleCopy}
        className="rounded-md p-1 transition-colors duration-100 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
        title="Copy to clipboard"
      >
        {copied ? (
          <Check className="size-3 text-[var(--status-success)]" />
        ) : (
          <Copy className="size-3" />
        )}
      </button>
    </div>
  );
}

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
        <Message from="user" className="group/msg">
          <div className="ml-auto flex w-fit max-w-full items-start gap-2">
            <div className="flex min-w-0 flex-col">
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
                      tooltip="Undo this turn"
                      label="Undo this turn"
                      className="h-7 w-7 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] shadow-sm hover:text-[var(--text-primary)]"
                      onClick={() => onRestoreTurnUndo(turnUndo)}
                    >
                      <RotateCcw className="size-3.5" />
                    </MessageAction>
                  </MessageActions>
                ) : null}
              </div>
              {message.text ? <UserCopyButton text={message.text} /> : null}
            </div>
            <ChatAvatar kind="user" />
          </div>
        </Message>
      );
    }

    case 'assistant': {
      const isDone = !message.isStreaming;
      const hasContent = !!message.text?.trim();
      const hasMemoryContext = !!(showMemory && message.memoryContext);
      const hasThinkingBlock = !!(showThinking && message.thinking);
      const showInlineThinkingIndicator = message.isStreaming
        && !hasContent
        && (!message.thinking || !showThinking);
      const showAvatar = hasContent;
      const showFeedback = isDone && hasContent && !!sessionId;

      // Truncate excerpts for storage (keep feedback entries lean).
      const promptExcerpt = previousUserText?.slice(0, 300);
      const responseExcerpt = message.text?.slice(0, 300);

      return (
        <Message from="assistant" className="group/msg flex-row items-start gap-2">
          {showAvatar ? <ChatAvatar kind="assistant" /> : null}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {hasMemoryContext ? (
              <MemoryContextBlock context={message.memoryContext!} />
            ) : null}
            {hasThinkingBlock ? (
              <ThinkingBlock
                thinking={message.thinking!}
                isStreaming={message.isStreaming && !hasContent}
              />
            ) : null}
            {hasContent ? (
              <MessageContent>
                <MessageResponse>{message.text}</MessageResponse>
              </MessageContent>
            ) : null}
            {showInlineThinkingIndicator ? <ThinkingIndicator /> : null}
            {showFeedback ? (
              <ResponseFeedback
                messageId={message.id}
                sessionId={sessionId}
                promptExcerpt={promptExcerpt}
                responseExcerpt={responseExcerpt}
                responseText={message.text}
              />
            ) : null}
          </div>
        </Message>
      );
    }

    default:
      return null;
  }
});
