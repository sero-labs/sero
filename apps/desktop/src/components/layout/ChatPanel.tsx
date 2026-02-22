import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Bot, MessageSquare, Loader2, AlertCircle, Settings2, Brain, X } from 'lucide-react';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@sero/ui/components/ai-elements/conversation';
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
} from '@sero/ui/components/ai-elements/prompt-input';
import { useAgentStore, useFocusedAgent, useFocusedCommands } from '@/stores/agent';
import { useSessionStore } from '@/stores/sessions';
import { SlashCommandMenu } from './SlashCommandMenu';
import { FileReferenceMenu } from './FileReferenceMenu';
import { PromptAttachmentsBar } from './ChatAttachments';
import { UsageBadge } from './UsageBadge';
import { ModelSelector } from './ModelSelector';
import { AuthLoginDialog } from './AuthLoginDialog';
import { groupMessages, ToolCallGroup } from './ToolCallGroup';
import { ContextEditor } from './ContextEditor';
import { ChatMessageItem } from './ChatMessageItem';
import { CheckpointRestoreDialog } from './CheckpointRestoreDialog';
import { VoiceTranscriptionControl } from './VoiceTranscriptionControl';
import { useContextEditorStore, useHasOverrides } from '@/stores/context-editor';
import { useFeedbackStore } from '@/stores/feedback';
import { useCheckpointRestore } from '@/hooks/useCheckpointRestore';
import { useWorkspaceFiles, fuzzyMatchFiles } from '@/hooks/useWorkspaceFiles';
import { useMessageQueue } from '@/hooks/useMessageQueue';
import { useEditorBridge } from '@/stores/editor-bridge';
import { createFilePathClickHandler } from './ClickableFilePath';
import { cn } from '@sero/ui/lib/utils';
import type { ChatAttachment, SeroSlashCommandInfo } from '@/types/ipc';

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
  const steerAgent = useAgentStore((s) => s.steerAgent);
  const abort = useAgentStore((s) => s.abort);
  const initEventListener = useAgentStore((s) => s.initEventListener);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** Tracks whether Ctrl/Meta was held on the most recent submit gesture. */
  const modifierRef = useRef(false);

  // Subscribe to main-process events on mount
  useEffect(() => {
    const unsub = initEventListener();
    return unsub;
  }, [initEventListener]);

  // Initialize feedback store (load ratings from disk)
  const initFeedback = useFeedbackStore((s) => s.init);
  useEffect(() => { initFeedback(); }, [initFeedback]);

  // ── OAuth login dialog state ───────────────────────────────
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<'login' | 'logout'>('login');
  const fetchModelState = useAgentStore((s) => s.fetchModelState);

  const messages = focused?.messages ?? [];
  const isStreaming = focused?.isStreaming ?? false;
  const error = focused?.error ?? null;
  const sessionId = focused?.sessionId ?? null;
  const focusedWorkspaceId = focused?.workspaceId ?? null;
  const checkpoint = useCheckpointRestore(focusedWorkspaceId, sessionId);

  // ── Workspace files for @ fuzzy search ─────────────────────
  const { files: workspaceFiles } = useWorkspaceFiles(focusedWorkspaceId);

  // ── Follow-up message queue ────────────────────────────────
  const messageQueue = useMessageQueue({
    isStreaming,
    sessionId,
    sendPrompt,
  });

  // ── Ctrl+click file paths in conversation ──────────────────
  const requestOpenFile = useEditorBridge((s) => s.requestOpenFile);
  const conversationClickHandler = useMemo(
    () =>
      focusedWorkspaceId
        ? createFilePathClickHandler(focusedWorkspaceId, requestOpenFile)
        : undefined,
    [focusedWorkspaceId, requestOpenFile],
  );

  // Resolve session name for the header badge
  const sessions = useSessionStore((s) => s.sessions);
  const activeSession = sessionId ? sessions.find((s) => s.id === sessionId) : null;
  const sessionLabel = activeSession?.name || activeSession?.firstMessage;

  const showThinkingBlocks = useAgentStore((s) => s.showThinkingBlocks);

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

  // ── @ file reference menu state ────────────────────────────
  // Match @<non-space-text> at the end of input — user is typing a file ref
  const atMatch = useMemo(() => {
    if (slashMenuOpen) return null;
    const m = input.match(/@([^\s@]*)$/);
    return m;
  }, [input, slashMenuOpen]);

  const fileMenuOpen = !!atMatch && !!sessionId;
  const fileFilter = atMatch?.[1] ?? '';

  const handleFileSelect = useCallback(
    (filePath: string) => {
      // Replace @<partial> with @<full_path> followed by a space
      setInput((prev) => prev.replace(/@[^\s@]*$/, `@${filePath} `));
      // Re-focus textarea
      textareaRef.current?.focus();
    },
    [],
  );

  const handleFileMenuClose = useCallback(() => {
    // Remove the dangling @ trigger
    setInput((prev) => prev.replace(/@[^\s@]*$/, ''));
  }, []);

  // ── Tab path completion ────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Capture modifier state on Enter so handleSubmit can distinguish
      // steer (default) from followUp (Ctrl/Meta+Enter).
      if (e.key === 'Enter' && !e.shiftKey) {
        modifierRef.current = e.ctrlKey || e.metaKey;
      }

      // Tab completion: complete partial path when Tab is pressed
      if (e.key === 'Tab' && !e.shiftKey && !slashMenuOpen && !fileMenuOpen) {
        // Check if the text before cursor contains a partial path (after @ or standalone)
        const cursorPos = e.currentTarget.selectionStart ?? input.length;
        const textBefore = input.slice(0, cursorPos);
        const pathMatch = textBefore.match(/@?([^\s@]+)$/);

        if (pathMatch) {
          const partial = pathMatch[1];
          const matches = fuzzyMatchFiles(workspaceFiles, partial, 1);
          if (matches.length > 0) {
            e.preventDefault();
            const completed = matches[0].path;
            const prefix = textBefore.slice(0, textBefore.length - pathMatch[0].length);
            const hasAt = pathMatch[0].startsWith('@');
            const after = input.slice(cursorPos);
            setInput(`${prefix}${hasAt ? '@' : ''}${completed}${after ? '' : ' '}${after}`);
          }
        }
      }
    },
    [input, slashMenuOpen, fileMenuOpen, workspaceFiles],
  );

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const text = (message.text ?? input).trim();
      if ((!text && !message.files?.length) || !sessionId) return;
      // Don't submit if slash menu or file menu is open (Enter selects from menu)
      if (slashMenuOpen || fileMenuOpen) return;

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

      // During streaming: Ctrl/Meta → queue as follow-up; default → steer
      if (isStreaming) {
        const wantsFollowUp = modifierRef.current;
        modifierRef.current = false;
        if (wantsFollowUp) {
          messageQueue.enqueue(text, attachments);
        } else {
          steerAgent(sessionId, text);
        }
        return;
      }

      modifierRef.current = false;
      sendPrompt(sessionId, text, attachments);
    },
    [input, sessionId, slashMenuOpen, fileMenuOpen, isStreaming, sendPrompt, steerAgent, messageQueue],
  );

  const handleTranscript = useCallback((text: string) => {
    const transcript = text.trim();
    if (!transcript) return;
    setInput((prev) => {
      if (!prev.trim()) return transcript;
      return `${prev}${prev.endsWith('\n') ? '' : '\n'}${transcript}`;
    });
  }, []);

  const hasSession = !!sessionId;

  return (
    <div className="flex h-full flex-col border-l border-[var(--border-default)] bg-[var(--bg-surface)]">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--border-default)] px-3">
        <Bot className="size-3.5 text-[var(--text-muted)]" />
        <span className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Agent
        </span>
        {sessionLabel && (
          <span className="truncate text-xs rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[var(--text-muted)]" style={{ maxWidth: '60%' }}>
            {sessionLabel}
          </span>
        )}
        {sessionId && <UsageBadge sessionId={sessionId} />}
        {isStreaming && (
          <Loader2 className="size-3 animate-spin text-emerald-500" />
        )}
      </div>

      {/* ── Conversation ────────────────────────────────────── */}
      <Conversation key={sessionId} className="min-h-0 flex-1" initial="instant">
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events,jsx-a11y/no-static-element-interactions */}
        <ConversationContent className="gap-4 p-3" onClick={conversationClickHandler}>
          {!hasSession ? (
            <EmptyState message="Select or create a chat to begin" />
          ) : messages.length === 0 && !isStreaming ? (
            <EmptyState message="Start a conversation" />
          ) : (
            <>
              {groupedItems.map((item, index) => {
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
                      workspaceId={focusedWorkspaceId}
                    />
                  );
                }

                // For assistant messages, find the most recent preceding user message
                // to include as context in feedback entries.
                let previousUserText: string | undefined;
                if (item.message.type === 'assistant') {
                  for (let j = index - 1; j >= 0; j--) {
                    const prev = groupedItems[j];
                    if (prev.kind === 'message' && prev.message.type === 'user') {
                      previousUserText = prev.message.text;
                      break;
                    }
                  }
                }

                return (
                  <ChatMessageItem
                    key={item.message.id}
                    message={item.message}
                    showThinking={showThinkingBlocks}
                    onRestoreCheckpoint={focusedWorkspaceId ? checkpoint.requestRestore : undefined}
                    sessionId={sessionId ?? undefined}
                    previousUserText={previousUserText}
                  />
                );
              })}
            </>
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

        {/* @ file reference autocomplete menu */}
        <FileReferenceMenu
          files={workspaceFiles}
          filter={fileFilter}
          onSelect={handleFileSelect}
          onClose={handleFileMenuClose}
          open={fileMenuOpen}
        />

        <PromptInput
          onSubmit={handleSubmit}
          className="w-full"
          multiple
          globalDrop={hasSession}
        >
          {/* Queued attachments + queued follow-up messages */}
          <PromptInputHeader>
            <PromptAttachmentsBar />
            {/* Follow-up message queue badges */}
            {messageQueue.hasQueued && (
              <div className="flex flex-wrap gap-1 px-1">
                {messageQueue.queue.map((msg) => (
                  <span
                    key={msg.id}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-600 dark:text-blue-400"
                  >
                    <span className="max-w-[150px] truncate">{msg.text}</span>
                    <button
                      onClick={() => messageQueue.dequeue(msg.id)}
                      className="shrink-0 rounded-full p-0.5 hover:bg-blue-500/20"
                      title="Remove queued message"
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </PromptInputHeader>

          <PromptInputBody>
            <PromptInputTextarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasSession ? 'Ask Sero anything… (/ for commands, @ for files)' : 'Select a chat first…'}
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
              <VoiceTranscriptionControl
                disabled={!hasSession || isStreaming}
                onTranscript={handleTranscript}
              />
              {/* Show/hide thinking blocks */}
              <ThinkingBlocksToggle disabled={!hasSession} />
              {/* Model + thinking level selector */}
              <ModelSelector disabled={!hasSession} />
            </PromptInputTools>

            {isStreaming ? (
              <div className="flex items-center gap-1.5">
                <PromptInputSubmit
                  disabled={!input.trim() || !hasSession}
                  onClick={(e) => { modifierRef.current = e.ctrlKey || e.metaKey; }}
                  title="Send to steer agent (⌘+click to queue as follow-up)"
                />
                <button
                  onClick={() => sessionId && abort(sessionId)}
                  className="rounded-md bg-destructive/10 px-2 py-1 font-medium text-sm text-destructive hover:bg-destructive/20"
                >
                  Stop
                </button>
              </div>
            ) : (
              <PromptInputSubmit disabled={!input.trim() || !hasSession} />
            )}
          </PromptInputFooter>
        </PromptInput>
      </div>

      <CheckpointRestoreDialog
        open={checkpoint.dialogOpen}
        checkpointId={checkpoint.target?.changeId ?? ''}
        files={checkpoint.previewFiles}
        isLoading={checkpoint.previewLoading}
        error={checkpoint.previewError}
        isRestoring={checkpoint.restoring}
        onOpenChange={checkpoint.setDialogOpen}
        onConfirm={checkpoint.confirmRestore}
      />

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

// ── Thinking blocks toggle ─────────────────────────────────────

function ThinkingBlocksToggle({ disabled }: { disabled: boolean }) {
  const focused = useFocusedAgent();
  const showThinking = useAgentStore((s) => s.showThinkingBlocks);
  const toggle = useAgentStore((s) => s.toggleThinkingBlocks);

  const isReasoning = focused?.modelState?.model.reasoning ?? false;
  const thinkingLevel = focused?.modelState?.thinkingLevel ?? 'off';
  const isActive = isReasoning && thinkingLevel !== 'off';

  return (
    <button
      onClick={toggle}
      disabled={disabled || !isActive}
      title={showThinking ? 'Hide thinking blocks' : 'Show thinking blocks'}
      className={cn(
        'rounded-md p-1.5 transition-colors duration-150',
        showThinking && isActive
          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
          : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]',
        'disabled:pointer-events-none disabled:opacity-40',
      )}
    >
      <Brain className="size-3.5" />
    </button>
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
