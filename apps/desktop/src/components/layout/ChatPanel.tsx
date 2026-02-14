import { useEffect, useState, useCallback, useMemo } from 'react';
import { Bot, MessageSquare, Loader2, AlertCircle } from 'lucide-react';
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
  PromptInputHeader,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool';
import { useAgentStore, useFocusedAgent, useFocusedCommands } from '@/stores/agent';
import { SlashCommandMenu } from './SlashCommandMenu';
import { PromptAttachmentsBar, MessageAttachments } from './ChatAttachments';
import type { ChatMessage, ChatAttachment, ChatToolCallMessage, SeroSlashCommandInfo } from '@/types/ipc';

/**
 * ChatPanel — agent chat panel wired to Pi SDK AgentSession pool.
 *
 * Uses ai-elements Conversation + Message + PromptInput + Tool.
 * Reads from the focused agent instance in the multi-session pool.
 */
export function ChatPanel() {
  const [input, setInput] = useState('');
  const focused = useFocusedAgent();
  const commands = useFocusedCommands();
  const sendPrompt = useAgentStore((s) => s.sendPrompt);
  const abort = useAgentStore((s) => s.abort);
  const initEventListener = useAgentStore((s) => s.initEventListener);

  // Subscribe to main-process events on mount
  useEffect(() => {
    const unsub = initEventListener();
    return unsub;
  }, [initEventListener]);

  const messages = focused?.messages ?? [];
  const isStreaming = focused?.isStreaming ?? false;
  const error = focused?.error ?? null;
  const sessionId = focused?.sessionId ?? null;

  // ── Slash command menu state ─────────────────────────────
  // Open when input starts with "/" and has no newlines before it
  const slashMenuOpen = useMemo(() => {
    if (!commands.length) return false;
    // Match "/" at start, optionally followed by partial command text (no spaces yet = still filtering)
    return /^\/[^\s]*$/.test(input);
  }, [input, commands]);

  // Text after the "/" for filtering
  const slashFilter = useMemo(() => {
    if (!slashMenuOpen) return '';
    return input.slice(1); // Remove leading "/"
  }, [input, slashMenuOpen]);

  const handleSlashSelect = useCallback(
    (cmd: SeroSlashCommandInfo) => {
      // Insert the command into input. Add trailing space for arguments.
      setInput(`/${cmd.name} `);
    },
    [],
  );

  const handleSlashClose = useCallback(() => {
    // User pressed Escape — clear the slash prefix
    setInput('');
  }, []);

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const text = (message.text ?? input).trim();
      if ((!text && !message.files?.length) || !sessionId) return;
      // Don't submit if slash menu is open (Enter selects from menu instead)
      if (slashMenuOpen) return;
      setInput('');

      // Convert FileUIParts → ChatAttachments for persistence
      const attachments: ChatAttachment[] | undefined = message.files?.length
        ? message.files.map((f, i) => ({
            id: `att-${Date.now()}-${i}`,
            filename: f.filename,
            mediaType: f.mediaType,
            url: f.url,
          }))
        : undefined;

      sendPrompt(sessionId, text, attachments);
    },
    [input, sessionId, slashMenuOpen, sendPrompt],
  );

  const hasSession = !!sessionId;

  return (
    <div className="flex h-full flex-col bg-[var(--bg-surface)]">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/50 px-3">
        <Bot className="size-3.5 text-[var(--text-muted)]" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Agent
        </span>
        {focused?.workspaceId && (
          <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
            {focused.workspaceId}
          </span>
        )}
        {isStreaming && (
          <Loader2 className="ml-auto size-3 animate-spin text-[var(--text-muted)]" />
        )}
      </div>

      {/* ── Conversation ────────────────────────────────────── */}
      <Conversation key={sessionId} className="min-h-0 flex-1" initial="instant">
        <ConversationContent className="gap-4 p-3">
          {!hasSession ? (
            <EmptyState message="Select or create a chat to begin" />
          ) : messages.length === 0 && !isStreaming ? (
            <EmptyState message="Start a conversation" />
          ) : (
            messages.map((msg) => (
              <ChatMessageItem key={msg.id} message={msg} />
            ))
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* ── Prompt input ────────────────────────────────────── */}
      <div className="relative shrink-0 p-2">
        {/* Slash command autocomplete menu */}
        <SlashCommandMenu
          commands={commands}
          filter={slashFilter}
          onSelect={handleSlashSelect}
          onClose={handleSlashClose}
          open={slashMenuOpen}
        />

        <PromptInput
          onSubmit={handleSubmit}
          className="w-full"
          multiple
          globalDrop={hasSession}
        >
          {/* Queued attachments shown as inline badges above the textarea */}
          <PromptInputHeader>
            <PromptAttachmentsBar />
          </PromptInputHeader>

          <PromptInputBody>
            <PromptInputTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={hasSession ? 'Ask Sero anything… (/ for commands)' : 'Select a chat first…'}
              disabled={!hasSession}
            />
          </PromptInputBody>

          <PromptInputFooter>
            <PromptInputTools>
              {/* "+" menu with "Add photos or files" action */}
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger
                  tooltip={{ content: 'Attach files', shortcut: '' }}
                  disabled={!hasSession}
                />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
            </PromptInputTools>

            {isStreaming ? (
              <button
                onClick={() => sessionId && abort(sessionId)}
                className="rounded-md bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/20"
              >
                Stop
              </button>
            ) : (
              <PromptInputSubmit disabled={!input.trim() || !hasSession} />
            )}
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

// ── Message renderer ───────────────────────────────────────────

function ChatMessageItem({ message }: { message: ChatMessage }) {
  switch (message.type) {
    case 'user':
      return (
        <Message from="user">
          <MessageContent>
            <MessageResponse>{message.text}</MessageResponse>
            {message.attachments?.length ? (
              <MessageAttachments attachments={message.attachments} />
            ) : null}
          </MessageContent>
        </Message>
      );

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

    case 'tool':
      return <ToolCallItem tool={message} />;

    default:
      return null;
  }
}

// ── Tool call renderer ─────────────────────────────────────────

/** Map our state to ToolUIPart state names. */
function mapToolState(
  state: ChatToolCallMessage['state'],
): 'input-streaming' | 'input-available' | 'output-available' | 'output-error' {
  switch (state) {
    case 'pending':
      return 'input-streaming';
    case 'running':
      return 'input-available';
    case 'completed':
      return 'output-available';
    case 'error':
      return 'output-error';
  }
}

function ToolCallItem({ tool }: { tool: ChatToolCallMessage }) {
  const isComplete = tool.state === 'completed' || tool.state === 'error';

  return (
    <Tool defaultOpen={isComplete}>
      <ToolHeader
        type={`tool-${tool.toolName}` as `tool-${string}`}
        state={mapToolState(tool.state)}
      />
      <ToolContent>
        <ToolInput input={tool.input} />
        {isComplete && (
          <ToolOutput
            output={tool.output}
            errorText={tool.isError ? (tool.output ?? 'Tool execution failed') : undefined}
          />
        )}
      </ToolContent>
    </Tool>
  );
}

// ── Empty state ────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <MessageSquare className="size-8 text-[var(--text-muted)]" />
      <span className="text-xs text-[var(--text-muted)]">{message}</span>
    </div>
  );
}
