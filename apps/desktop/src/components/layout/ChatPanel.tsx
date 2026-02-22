import { useEffect, useState, useCallback, useMemo } from 'react';
import { Bot, Loader2, AlertCircle, X } from 'lucide-react';
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
} from '@sero/ui/components/ai-elements/prompt-input';
import { useAgentStore, useFocusedAgent } from '@/stores/agent';
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
import { useFeedbackStore } from '@/stores/feedback';
import { useCheckpointRestore } from '@/hooks/useCheckpointRestore';
import { useMessageQueue } from '@/hooks/useMessageQueue';
import { useEditorBridge } from '@/stores/editor-bridge';
import { useUserFeedbackInit } from '@/hooks/useUserFeedbackInit';
import { useChatPromptInput } from '@/hooks/useChatPromptInput';
import { createFilePathClickHandler } from './ClickableFilePath';
import { PendingQuestionCard } from './PendingQuestionCard';
import { QuestionnaireNotice } from './QuestionnaireNotice';
import { ContextEditorMenuItem, ThinkingBlocksToggle, EmptyState } from './ChatPanelHelpers';

/**
 * ChatPanel — agent chat panel wired to Pi SDK AgentSession pool.
 *
 * Uses ai-elements Conversation + Message + PromptInput + Tool.
 * Reads from the focused agent instance in the multi-session pool.
 */
export function ChatPanel() {
  const focused = useFocusedAgent();
  const sendPrompt = useAgentStore((s) => s.sendPrompt);
  const steerAgent = useAgentStore((s) => s.steerAgent);
  const abort = useAgentStore((s) => s.abort);
  const initEventListener = useAgentStore((s) => s.initEventListener);

  // Subscribe to main-process events on mount
  useEffect(() => {
    const unsub = initEventListener();
    return unsub;
  }, [initEventListener]);

  // Initialize feedback store (load ratings from disk)
  const initFeedback = useFeedbackStore((s) => s.init);
  useEffect(() => { initFeedback(); }, [initFeedback]);

  // Initialize user-feedback IPC listeners (question/questionnaire tools)
  useUserFeedbackInit();

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

  // ── Follow-up message queue ────────────────────────────────
  const messageQueue = useMessageQueue({
    isStreaming,
    sessionId,
    sendPrompt,
  });

  const onLoginRequest = useCallback((mode: 'login' | 'logout') => {
    setLoginMode(mode);
    setLoginDialogOpen(true);
  }, []);

  // ── Prompt input (slash, @file, tab-complete, submit) ──────
  const prompt = useChatPromptInput({
    sessionId,
    isStreaming,
    focusedWorkspaceId,
    sendPrompt,
    steerAgent,
    messageQueue,
    onLoginRequest,
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

  const handleTranscript = useCallback((text: string) => {
    const transcript = text.trim();
    if (!transcript) return;
    prompt.setInput((prev) => {
      if (!prev.trim()) return transcript;
      return `${prev}${prev.endsWith('\n') ? '' : '\n'}${transcript}`;
    });
  }, [prompt]);

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
                  const isLast = index === groupedItems.length - 1;
                  const isFinalized = !isLast || !isStreaming;

                  // Replace a running questionnaire tool call with clickable notice
                  const isRunningQuestionnaire =
                    item.tools.length === 1 &&
                    item.tools[0].toolName === 'questionnaire' &&
                    (item.tools[0].state === 'pending' || item.tools[0].state === 'running');

                  if (isRunningQuestionnaire) {
                    return <QuestionnaireNotice key={item.id} tools={item.tools} />;
                  }

                  return (
                    <ToolCallGroup
                      key={item.id}
                      tools={item.tools}
                      isFinalized={isFinalized}
                      workspaceId={focusedWorkspaceId}
                    />
                  );
                }

                // For assistant messages, find preceding user message for feedback context
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

      {/* ── Pending question card (single questions only) ──── */}
      <PendingQuestionCard />

      {/* ── Prompt input ────────────────────────────────────── */}
      <div className="relative shrink-0 p-2">
        <SlashCommandMenu
          commands={prompt.allCommands}
          filter={prompt.slashFilter}
          onSelect={prompt.handleSlashSelect}
          onClose={prompt.handleSlashClose}
          open={prompt.slashMenuOpen}
        />

        <FileReferenceMenu
          files={prompt.workspaceFiles}
          filter={prompt.fileFilter}
          onSelect={prompt.handleFileSelect}
          onClose={prompt.handleFileMenuClose}
          open={prompt.fileMenuOpen}
        />

        <PromptInput
          onSubmit={prompt.handleSubmit}
          className="w-full"
          multiple
          globalDrop={hasSession}
        >
          <PromptInputHeader>
            <PromptAttachmentsBar />
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
              ref={prompt.textareaRef}
              value={prompt.input}
              onChange={(e) => prompt.setInput(e.target.value)}
              onKeyDown={prompt.handleKeyDown}
              placeholder={hasSession ? 'Ask Sero anything… (/ for commands, @ for files)' : 'Select a chat first…'}
              disabled={!hasSession}
            />
          </PromptInputBody>

          <PromptInputFooter>
            <PromptInputTools>
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
              <ThinkingBlocksToggle disabled={!hasSession} />
              <ModelSelector disabled={!hasSession} />
            </PromptInputTools>

            {isStreaming ? (
              <div className="flex items-center gap-1.5">
                <PromptInputSubmit
                  disabled={!prompt.input.trim() || !hasSession}
                  onClick={(e) => { prompt.modifierRef.current = e.ctrlKey || e.metaKey; }}
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
              <PromptInputSubmit disabled={!prompt.input.trim() || !hasSession} />
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

      <AuthLoginDialog
        open={loginDialogOpen}
        onOpenChange={setLoginDialogOpen}
        mode={loginMode}
        onComplete={handleAuthComplete}
      />

      {sessionId && <ContextEditor sessionId={sessionId} />}
    </div>
  );
}
