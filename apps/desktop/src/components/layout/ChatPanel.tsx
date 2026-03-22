import { useEffect, useMemo } from 'react';
import { Bot, Loader2, AlertCircle } from 'lucide-react';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@sero/ui/components/ai-elements/conversation';
import { useAgentStore } from '@/stores/agent';
import {
  useFocusedAgent,
  useFocusedCollaborationMode,
  useFocusedCollaborationStrategy,
} from '@/stores/agent-selectors';
import { useSessionStore } from '@/stores/sessions';
import { SessionBadge } from './SessionBadge';
import { groupMessages, ToolCallGroup } from './ToolCallGroup';
import { ChatMessageItem } from './ChatMessageItem';
import { CheckpointRestoreDialog } from './CheckpointRestoreDialog';
import { useFeedbackStore } from '@/stores/feedback';
import { useCheckpointRestore } from '@/hooks/useCheckpointRestore';
import { useEditorBridge } from '@/stores/editor-bridge';
import { useUserFeedbackInit } from '@/hooks/useUserFeedbackInit';
import { createFilePathClickHandler } from './ClickableFilePath';
import { PendingQuestionCard } from './PendingQuestionCard';
import { QuestionnaireNotice } from './QuestionnaireNotice';
import { EmptyState } from './ChatPanelHelpers';
import { CollaborationDetails } from './CollaborationResponse';
import { CollaborationActivityPanel } from './CollaborationActivityPanel';
import { ChatPromptArea } from './ChatPromptArea';
import { ImageLightbox } from './ImageLightbox';

/**
 * ChatPanel — agent chat panel wired to Pi SDK AgentSession pool.
 *
 * Uses ai-elements Conversation + Message + PromptInput + Tool.
 * Reads from the focused agent instance in the multi-session pool.
 */
export function ChatPanel() {
  const focused = useFocusedAgent();

  // Initialize feedback store (load ratings from disk)
  const initFeedback = useFeedbackStore((s) => s.init);
  useEffect(() => { initFeedback(); }, [initFeedback]);

  // Initialize user-feedback IPC listeners (question/questionnaire tools)
  useUserFeedbackInit();

  const collaborationMode = useFocusedCollaborationMode();
  const collaborationStrategy = useFocusedCollaborationStrategy();

  const messages = focused?.messages ?? [];
  const isStreaming = focused?.isStreaming ?? false;
  const error = focused?.error ?? null;
  const sessionId = focused?.sessionId ?? null;
  const focusedWorkspaceId = focused?.workspaceId ?? null;
  const checkpoint = useCheckpointRestore(focusedWorkspaceId, sessionId);

  // Stable callback ref for ChatMessageItem memo
  const stableRestoreHandler = useMemo(
    () => (focusedWorkspaceId ? checkpoint.requestRestore : undefined),
    [focusedWorkspaceId, checkpoint.requestRestore],
  );

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
  const showMemoryBlocks = useAgentStore((s) => s.showMemoryBlocks);

  // Group consecutive tool calls into collapsible blocks
  const groupedItems = useMemo(() => groupMessages(messages), [messages]);

  // Precompute previousUserText for each item index so we avoid an O(n)
  // backwards scan per assistant message during render.
  const previousUserTextMap = useMemo(() => {
    const map = new Map<number, string>();
    let lastUserText: string | undefined;
    for (let i = 0; i < groupedItems.length; i++) {
      const item = groupedItems[i];
      if (item.kind === 'message' && item.message.type === 'user') {
        lastUserText = item.message.text;
      } else if (item.kind === 'message' && item.message.type === 'assistant' && lastUserText) {
        map.set(i, lastUserText);
      }
    }
    return map;
  }, [groupedItems]);

  // Show an inline "thinking" indicator when the session is streaming but
  // nothing in the chat is visibly active (no streaming text, no running tools).
  const showThinking = useMemo(() => {
    if (!isStreaming || groupedItems.length === 0) return false;
    const last = groupedItems[groupedItems.length - 1];
    if (last.kind === 'message' && last.message.type === 'assistant' && last.message.isStreaming) return false;
    if (last.kind === 'tool-group' && last.tools.some((t) => t.state === 'pending' || t.state === 'running')) return false;
    return true;
  }, [isStreaming, groupedItems]);

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
        {collaborationMode && (
          <span className="rounded bg-[var(--collab-primary-subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--collab-primary)]">
            {collaborationStrategy === 'debate' ? 'Debate' : '4-Agent'}
          </span>
        )}
        {sessionId && <SessionBadge sessionId={sessionId} />}
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

                  // Replace a running questionnaire/interview tool call with clickable notice
                  const feedbackToolName = item.tools[0]?.toolName;
                  const isRunningFeedbackForm =
                    item.tools.length === 1 &&
                    (feedbackToolName === 'questionnaire' || feedbackToolName === 'interview') &&
                    (item.tools[0].state === 'pending' || item.tools[0].state === 'running');

                  if (isRunningFeedbackForm) {
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

                return (
                  <ChatMessageItem
                    key={item.message.id}
                    message={item.message}
                    showThinking={showThinkingBlocks}
                    showMemory={showMemoryBlocks}
                    onRestoreCheckpoint={stableRestoreHandler}
                    sessionId={sessionId ?? undefined}
                    previousUserText={previousUserTextMap.get(index)}
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

          {error && <ChatError error={error} />}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* ── Collaboration activity + expandable details ──────── */}
      <CollaborationActivityPanel />
      <CollaborationDetails />

      {/* ── Pending question card (single questions only) ──── */}
      <PendingQuestionCard />

      {/* ── Prompt input (memo'd — skips re-renders during streaming) */}
      <ChatPromptArea
        sessionId={sessionId}
        isStreaming={isStreaming}
        focusedWorkspaceId={focusedWorkspaceId}
      />

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

      {/* Global image lightbox — mounted once, controlled via useLightbox store */}
      <ImageLightbox />
    </div>
  );
}

// ── Inline error banner ──────────────────────────────────────

/** Detect auth / API-key errors and show a friendly message. */
function isAuthError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes('no api key') ||
    lower.includes('api key not found') ||
    lower.includes('authentication') ||
    lower.includes('unauthorized') ||
    lower.includes('401')
  );
}

function ChatError({ error }: { error: string }) {
  const friendly = isAuthError(error);

  return (
    <div className="mx-3 mb-2 flex flex-col gap-1.5 rounded-md bg-destructive/10 px-3 py-2.5 text-xs">
      {friendly ? (
        <>
          <div className="flex items-start gap-2 text-destructive">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span className="font-medium">Not signed in</span>
          </div>
          <p className="pl-[22px] text-[var(--text-muted)]">
            You need to authenticate before using the agent. Type{' '}
            <code className="rounded bg-[var(--bg-elevated)] px-1 py-0.5 text-[var(--text-secondary)]">/login</code>{' '}
            in the chat input to sign in.
          </p>
        </>
      ) : (
        <div className="flex items-start gap-2 text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span className="break-words break-all">{error}</span>
        </div>
      )}
    </div>
  );
}
