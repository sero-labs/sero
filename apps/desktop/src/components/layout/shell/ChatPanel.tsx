import { useCallback, useEffect, useMemo } from 'react';
import { Bot, AlertCircle } from 'lucide-react';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@sero-ai/ui/ai-elements/conversation';
import { useAgentStore } from '@/stores/agent';
import { useFocusedAgent } from '@/stores/agent-selectors';
import { useSessionStore } from '@/stores/sessions';
import { SessionBadge } from '@/components/layout/SessionBadge';
import { ToolCallGroup } from '@/components/layout/ToolCallGroup';
import {
  groupMessages,
  isToolGroupFinalized,
} from '@/components/layout/tool-call-helpers/group-messages';
import { ChatMessageItem } from '@/components/layout/ChatMessageItem';
import { CheckpointRestoreDialog } from '@/components/layout/workspace/CheckpointRestoreDialog';
import { useFeedbackStore } from '@/stores/feedback';
import { useCheckpointRestore } from '@/hooks/useCheckpointRestore';
import { useEditorBridge } from '@/stores/editor-bridge';
import { useUserFeedbackInit } from '@/hooks/useUserFeedbackInit';
import { createFilePathClickHandler } from '@/components/layout/ClickableFilePath';
import { PendingQuestionCard } from '@/components/layout/PendingQuestionCard';
import { QuestionnaireNotice, getFeedbackToolGroupDisposition } from '@/components/layout/QuestionnaireNotice';
import { EmptyState, RetryIndicator, ThinkingIndicator } from '@/components/layout/ChatPanelHelpers';
import { ChatPromptArea } from '@/components/layout/ChatPromptArea';
import { ImageLightbox } from '@/components/layout/ImageLightbox';
import { parseSessionLocationKey, useNodesStore } from '@/stores/nodes';
import { RemoteConversation } from '@/components/layout/nodes/RemoteConversation';
import { GoalBanner } from '@/components/layout/GoalBanner';
import { goalBannerCommands, type GoalBannerAction } from '@/components/layout/goal-banner-actions';

const EMPTY_MESSAGES: NonNullable<ReturnType<typeof useFocusedAgent>>['messages'] = [];

/**
 * ChatPanel, agent chat panel wired to Pi SDK AgentSession pool.
 *
 * Uses ai-elements Conversation + Message + PromptInput + Tool.
 * Reads from the focused agent instance in the multi-session pool.
 */
export function ChatPanel() {
  const remoteLocationKey = useNodesStore((state) => state.activeLocationKey);
  const remoteLocation = parseSessionLocationKey(remoteLocationKey);
  if (remoteLocation?.kind === 'node') return <RemoteConversation location={remoteLocation} />;
  return <LocalChatPanel />;
}

function LocalChatPanel() {
  const focused = useFocusedAgent();
  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  // Initialize feedback store (load ratings from disk)
  const initFeedback = useFeedbackStore((s) => s.init);
  useEffect(() => {
    initFeedback();
  }, [initFeedback]);

  // Initialize user-feedback IPC listeners (question/questionnaire tools)
  useUserFeedbackInit();

  const messages = focused?.messages ?? EMPTY_MESSAGES;
  const isStreaming = focused?.isStreaming ?? false;
  const retry = focused?.retry ?? null;
  const error = focused?.error ?? null;
  const sessionId = focused?.sessionId ?? null;
  const focusedWorkspaceId = focused?.workspaceId ?? null;
  const composerPrefill = useAgentStore((s) =>
    sessionId ? (s.composerPrefills[sessionId] ?? null) : null,
  );
  const clearComposerPrefill = useAgentStore((s) => s.clearComposerPrefill);
  const checkpoint = useCheckpointRestore(focusedWorkspaceId, sessionId);

  // Stable callback ref for ChatMessageItem memo
  const stableRestoreHandler = useMemo(
    () => (focusedWorkspaceId ? checkpoint.requestRestore : undefined),
    [focusedWorkspaceId, checkpoint.requestRestore],
  );

  const handleComposerDraftApplied = useCallback(
    (draft: { requestId: string }) => {
      if (!sessionId) return;
      clearComposerPrefill(sessionId, draft.requestId);
    },
    [clearComposerPrefill, sessionId],
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
  const sendPrompt = useAgentStore((s) => s.sendPrompt);

  const goal = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.type === 'goal-state') return message.goal;
      if (message.type === 'goal-status' && message.goal) return message.goal;
    }
    return null;
  }, [messages]);

  const onGoalAction = useCallback((action: GoalBannerAction) => {
    if (!sessionId || !goal) return;
    void goalBannerCommands(goal, action).reduce(
      (previous, command) => previous.then(() => sendPrompt(sessionId, command)),
      Promise.resolve(),
    );
  }, [goal, sendPrompt, sessionId]);

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
      } else if (
        item.kind === 'message' &&
        item.message.type === 'assistant' &&
        lastUserText
      ) {
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
    if (
      last.kind === 'message' &&
      last.message.type === 'assistant' &&
      last.message.isStreaming
    ) {
      return false;
    }
    if (
      last.kind === 'tool-group' &&
      last.tools.some((tool) => tool.state === 'pending' || tool.state === 'running')
    ) {
      return false;
    }
    return true;
  }, [isStreaming, groupedItems]);

  const hasSession = !!sessionId;
  const isSessionFocusPending = !!activeSessionId && !sessionId;

  const conversation = (
    <Conversation key={sessionId} className="min-h-0 flex-1" initial="instant">
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events,jsx-a11y/no-static-element-interactions */}
      <ConversationContent className="gap-2.5 p-3" onClick={conversationClickHandler}>
        {isSessionFocusPending ? (
          <EmptyState message="Loading chat..." />
        ) : !hasSession ? (
          <EmptyState message="Select or create a chat to begin" />
        ) : messages.length === 0 && !isStreaming ? (
          <EmptyState message="Start a conversation" />
        ) : (
          <>
            {groupedItems.map((item, index) => {
              if (item.kind === 'tool-group') {
                const isFinalized = isToolGroupFinalized(groupedItems, index);

                const feedbackDisposition = getFeedbackToolGroupDisposition(item.tools);
                if (feedbackDisposition === 'hide') {
                  return null;
                }
                if (feedbackDisposition === 'notice') {
                  return (
                    <QuestionnaireNotice
                      key={item.id}
                      tools={item.tools}
                      sessionLabel={sessionLabel ?? null}
                    />
                  );
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
                  onRestoreTurnUndo={stableRestoreHandler}
                  sessionId={sessionId ?? undefined}
                  previousUserText={previousUserTextMap.get(index)}
                />
              );
            })}
          </>
        )}

        {retry ? <RetryIndicator retry={retry} /> : showThinking ? <ThinkingIndicator /> : null}

        {error && <ChatError error={error} />}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );

  return (
    <div className="flex h-full flex-col border-l border-[var(--border-default)] bg-[var(--bg-surface)]">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--border-default)] px-3">
        <Bot className="size-3.5 text-[var(--text-muted)]" />
        <span className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
          Agent
        </span>
        {sessionLabel && (
          <span
            className="truncate rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]"
            style={{ maxWidth: '60%' }}
          >
            {sessionLabel}
          </span>
        )}
        {sessionId && <SessionBadge sessionId={sessionId} />}
      </div>

      {goal ? <GoalBanner goal={goal} onAction={onGoalAction} /> : null}

      {conversation}

      {/* ── Pending question card (single questions only) ──── */}
      <PendingQuestionCard />

      {/* ── Prompt input (memo'd, skips re-renders during streaming) */}
      <ChatPromptArea
        sessionId={sessionId}
        isStreaming={isStreaming}
        focusedWorkspaceId={focusedWorkspaceId}
        externalDraft={composerPrefill}
        onExternalDraftApplied={handleComposerDraftApplied}
      />

      <CheckpointRestoreDialog
        open={checkpoint.dialogOpen}
        snapshotId={checkpoint.target?.snapshotId ?? ''}
        undoLabel={checkpoint.target?.label}
        files={checkpoint.previewFiles}
        isLoading={checkpoint.previewLoading}
        error={checkpoint.previewError}
        isRestoring={checkpoint.restoring}
        onOpenChange={checkpoint.setDialogOpen}
        onConfirm={checkpoint.confirmRestore}
      />

      {/* Global image lightbox, mounted once, controlled via useLightbox store */}
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
            <code className="rounded bg-[var(--bg-elevated)] px-1 py-0.5 text-[var(--text-secondary)]">
              /login
            </code>{' '}
            in the chat input to sign in.
          </p>
        </>
      ) : (
        <div className="flex items-start gap-2 text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span className="break-all break-words">{error}</span>
        </div>
      )}
    </div>
  );
}
