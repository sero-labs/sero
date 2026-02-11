import { useState } from 'react';
import { Bot, MessageSquare } from 'lucide-react';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
} from '@/components/ai-elements/prompt-input';

// ── Dummy messages for layout purposes ─────────────────────────
interface DummyMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const dummyMessages: DummyMessage[] = [
  {
    id: '1',
    role: 'user',
    text: 'Can you help me set up a new Express server with TypeScript?',
  },
  {
    id: '2',
    role: 'assistant',
    text: "Sure! Here's a basic Express + TypeScript setup:\n\n```bash\nnpm init -y\nnpm install express\nnpm install -D typescript @types/express @types/node ts-node\n```\n\nThen create a `tsconfig.json` and your entry file. Want me to generate the full scaffold?",
  },
  {
    id: '3',
    role: 'user',
    text: 'Yes please, generate the full scaffold.',
  },
  {
    id: '4',
    role: 'assistant',
    text: "Here's the project structure:\n\n```\nsrc/\n  index.ts\n  routes/\n    health.ts\ntsconfig.json\npackage.json\n```\n\nI'll create each file now.",
  },
];

/**
 * ChatPanel — agent chat panel for the coding workspace.
 *
 * Uses ai-elements Conversation + Message + PromptInput.
 * Dummy data for now — will wire to a real agent session later.
 */
export function ChatPanel() {
  const [input, setInput] = useState('');

  return (
    <div className="flex h-full flex-col bg-[var(--bg-surface)]">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/50 px-3">
        <Bot className="size-3.5 text-[var(--text-muted)]" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Agent
        </span>
      </div>

      {/* ── Conversation ────────────────────────────────────── */}
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-4 p-3">
          {dummyMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <MessageSquare className="size-8 text-[var(--text-muted)]" />
              <span className="text-xs text-[var(--text-muted)]">
                Start a conversation
              </span>
            </div>
          ) : (
            dummyMessages.map((msg) => (
              <Message from={msg.role} key={msg.id}>
                <MessageContent>
                  <MessageResponse>{msg.text}</MessageResponse>
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* ── Prompt input ────────────────────────────────────── */}
      <div className="shrink-0 p-2">
        <PromptInput
          onSubmit={() => {
            setInput('');
          }}
          className="w-full"
        >
          <PromptInputBody>
            <PromptInputTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Sero anything…"
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools />
            <PromptInputSubmit disabled={!input.trim()} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
