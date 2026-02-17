import { useEffect, useState, useCallback, useMemo } from 'react';
import { Bot, MessageSquare, Loader2, AlertCircle, Settings2 } from 'lucide-react';
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
  PromptInputActionMenuItem,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import { useAgentStore, useFocusedAgent, useFocusedCommands } from '@/stores/agent';
import { SlashCommandMenu } from './SlashCommandMenu';
import { PromptAttachmentsBar, MessageAttachments } from './ChatAttachments';
import { UsageBadge } from './UsageBadge';
import { ModelSelector } from './ModelSelector';
import { AuthLoginDialog } from './AuthLoginDialog';
import { groupMessages, ToolCallGroup } from './ToolCallGroup';
import { ContextEditor } from './ContextEditor';
import { useContextEditorStore, useHasOverrides } from '@/stores/context-editor';
import type { ChatMessage, ChatAttachment, SeroSlashCommandInfo } from '@/types/ipc';

/** Built-in commands handled client-side (not sent to the agent). */
const BUILTIN_COMMANDS: SeroSlashCommandInfo[] = [
  { name: 'login', description: 'Login with OAuth provider', source: 'extension' },
  { name: 'logout', description: 'Logout from OAuth provider', source: 'extension' },
];

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

  // ── OAuth login dialog state ───────────────────────────────
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<'login' | 'logout'>('login');
  const fetchModelState = useAgentStore((s) => s.fetchModelState);

  const messages = focused?.messages ?? [];
  const isStreaming = focused?.isStreaming ?? false;
  const error = focused?.error ?? null;
  const sessionId = focused?.sessionId ?? null;

  // Group consecutive tool calls into collapsible blocks
  const groupedItems = useMemo(() => groupMessages(messages), [messages]);

  // Show an inline "thinking" indicator when the session is streaming but
  // nothing in the chat is visibly active (no streaming text, no running tools).
  // This covers the gap when the SDK is generating a large tool call payload.
  const showThinking = useMemo(() => {
    if (!isStreaming || groupedItems.length === 0) return false;
    const last = groupedItems[groupedItems.length - 1];
    if (last.kind === 'message' && last.message.type === 'assistant' && last.message.isStreaming) return false;
    if (last.kind === 'tool-group' && last.tools.some((t) => t.state === 'pending' || t.state === 'running')) return false;
    return true;
  }, [isStreaming, groupedItems]);

  const handleAuthComplete = useCallback(() => {
    if (sessionId) fetchModelState(sessionId);
  }, [sessionId, fetchModelState]);

  // ── Slash command menu state ─────────────────────────────
  // Merge SDK commands with built-in client-side commands
  const allCommands = useMemo(
    () => [...BUILTIN_COMMANDS, ...commands],
    [commands],
  );

  // Open when input starts with "/" and has no newlines before it
  const slashMenuOpen = useMemo(() => {
    if (!allCommands.length) return false;
    // Match "/" at start, optionally followed by partial command text (no spaces yet = still filtering)
    return /^\/[^\s]*$/.test(input);
  }, [input, allCommands]);

  // Text after the "/" for filtering
  const slashFilter = useMemo(() => {
    if (!slashMenuOpen) return '';
    return input.slice(1); // Remove leading "/"
  }, [input, slashMenuOpen]);

  const handleSlashSelect = useCallback(
    (cmd: SeroSlashCommandInfo) => {
      // Handle built-in commands that open UI instead of sending to agent
      if (cmd.name === 'login') {
        setInput('');
        setLoginMode('login');
        setLoginDialogOpen(true);
        return;
      }
      if (cmd.name === 'logout') {
        setInput('');
        setLoginMode('logout');
        setLoginDialogOpen(true);
        return;
      }
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

      // Intercept /login and /logout commands — handle client-side
      if (text === '/login' || text.startsWith('/login ')) {
        setInput('');
        setLoginMode('login');
        setLoginDialogOpen(true);
        return;
      }
      if (text === '/logout' || text.startsWith('/logout ')) {
        setInput('');
        setLoginMode('logout');
        setLoginDialogOpen(true);
        return;
      }

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
        <span className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Agent
        </span>
        {focused?.workspaceId && (
          <span className="text-xs rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[var(--text-muted)]">
            {focused.workspaceId}
          </span>
        )}
        {sessionId && <UsageBadge sessionId={sessionId} />}
        {isStreaming && (
          <Loader2 className="size-3 animate-spin text-emerald-500" />
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
            groupedItems.map((item, index) => {
              if (item.kind === 'tool-group') {
                // A group is finalized when a non-tool item follows it,
                // or it's the last item and the session is no longer streaming.
                const isLast = index === groupedItems.length - 1;
                const isFinalized = !isLast || !isStreaming;
                return (
                  <ToolCallGroup
                    key={item.id}
                    tools={item.tools}
                    isFinalized={isFinalized}
                  />
                );
              }
              return (
                <ChatMessageItem key={item.message.id} message={item.message} />
              );
            })
          )}

          {showThinking && (
            <div className="flex items-center gap-2 px-2 py-1">
              <Loader2 className="size-3.5 animate-spin text-[var(--text-muted)]" />
              <span className="text-xs text-[var(--text-muted)]">Thinking…</span>
            </div>
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
          commands={allCommands}
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
              {/* "+" menu with attachments + context editor */}
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger
                  tooltip={{ content: 'Actions', shortcut: '' }}
                  disabled={!hasSession}
                />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments />
                  <ContextEditorMenuItem sessionId={sessionId} disabled={isStreaming} />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
              {/* Model + thinking level selector */}
              <ModelSelector disabled={!hasSession} />
            </PromptInputTools>

            {isStreaming ? (
              <button
                onClick={() => sessionId && abort(sessionId)}
                className="rounded-md bg-destructive/10 px-2 py-1 font-medium text-sm text-destructive hover:bg-destructive/20"
              >
                Stop
              </button>
            ) : (
              <PromptInputSubmit disabled={!input.trim() || !hasSession} />
            )}
          </PromptInputFooter>
        </PromptInput>
      </div>

      {/* Auth login/logout dialog (OAuth + API key) */}
      <AuthLoginDialog
        open={loginDialogOpen}
        onOpenChange={setLoginDialogOpen}
        mode={loginMode}
        onComplete={handleAuthComplete}
      />

      {/* Context editor dialog (only for new sessions) */}
      {sessionId && <ContextEditor sessionId={sessionId} />}
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

    default:
      return null;
  }
}

// ── Context editor menu item ───────────────────────────────────

function ContextEditorMenuItem({
  sessionId,
  disabled,
}: {
  sessionId: string | null;
  disabled?: boolean;
}) {
  const openEditor = useContextEditorStore((s) => s.open);
  const hasOverrides = useHasOverrides();

  return (
    <PromptInputActionMenuItem
      disabled={disabled || !sessionId}
      onSelect={(e) => {
        e.preventDefault();
        if (sessionId) openEditor(sessionId);
      }}
    >
      <Settings2 className="mr-2 size-4" />
      Session context
      {hasOverrides && (
        <span className="ml-auto size-1.5 rounded-full bg-[var(--accent)]" />
      )}
    </PromptInputActionMenuItem>
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
