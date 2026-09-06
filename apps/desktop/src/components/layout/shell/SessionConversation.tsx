import { useState, type ReactNode } from 'react';
import { Conversation, type ConversationProps } from '@sero-ai/ui/ai-elements/conversation';
import type { ChatMessage } from '@/types/ipc';

type SessionConversationProps = Omit<ConversationProps, 'initial' | 'resize' | 'children'> & {
  children: ReactNode | ((initialScrollToEnd: boolean) => ReactNode);
  messages: ChatMessage[];
  isStreaming: boolean;
};

/** Mount with a session key so each visit starts without a scroll animation. */
export function SessionConversation({ messages, isStreaming, children, ...props }: SessionConversationProps) {
  const tail = messages.at(-1) ?? null;
  const [initialTail, setInitialTail] = useState(tail);

  // History can arrive after mount. Capture it before rendering the scroller,
  // but let a first live message in an empty chat use normal auto-scroll.
  if (initialTail === null && tail !== null && !isStreaming) {
    setInitialTail(tail);
  }

  return (
    <Conversation
      {...props}
      initial="instant"
      resize={tail === initialTail ? 'instant' : 'smooth'}
    >
      {typeof children === 'function' ? children(tail === initialTail) : children}
    </Conversation>
  );
}
