/**
 * Chat panel — chat header, conversation, composer.
 *
 * `Conversation` from `@sero-ai/ui` handles stick-to-bottom scrolling,
 * the same component the desktop uses. The message list, the choice card
 * and the composer live in their own files; this one wires them together.
 */

import { useChatStore } from '@/stores/chat';
import { useWorkspaceStore } from '@/stores/workspace';
import { ChatMessageComponent } from './ChatMessage';
import { ChatComposer } from './ChatComposer';
import { ChoiceCard } from './ChoiceCard';
import { ChatHeader } from './ChatHeader';
import { ToolCallGroup } from './ToolCallGroup';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationEmptyState,
} from '@sero-ai/ui/ai-elements/conversation';
import { MessageSquare } from 'lucide-react';

export function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const renderItems = useChatStore((s) => s.renderItems);
  const isLoadingHistory = useChatStore((s) => s.isLoadingHistory);
  const activeSessionId = useWorkspaceStore((s) => s.activeSessionId);

  const isEmpty = messages.length === 0 && !isLoadingHistory;

  return (
    <div className="flex h-full flex-col">
      <ChatHeader />

      {/* Scrollable conversation, StickToBottom handles auto-scroll */}
      <Conversation
        key={activeSessionId ?? '__empty'}
        className="min-h-0 flex-1"
        initial="instant"
      >
        <ConversationContent className="gap-3 px-4 py-3">
          {isEmpty && (
            <ConversationEmptyState
              icon={<MessageSquare className="size-8" />}
              title="Sero Remote"
              description="Send a message to start a conversation"
            />
          )}

          {isLoadingHistory && messages.length === 0 && (
            <ConversationEmptyState title="Loading conversation..." description="" />
          )}

          {renderItems.map((item) =>
            item.type === 'message' ? (
              <ChatMessageComponent key={item.message.id} message={item.message} />
            ) : (
              <ToolCallGroup key={item.group.id} toolCalls={item.group.toolCalls} />
            ),
          )}
        </ConversationContent>

        <ConversationScrollButton />
      </Conversation>

      <ChoiceCard />

      <ChatComposer />
    </div>
  );
}
