/**
 * ChatPromptArea — extracted from ChatPanel so the prompt input tree
 * doesn't re-render on every streaming token.
 *
 * Subscribes to store selectors that return primitives (sessionId,
 * isStreaming, workspaceId, collaborationMode) so Zustand's Object.is
 * check keeps this stable during text streaming.
 */

import { memo, useState, useCallback } from 'react';
import { Loader2, X } from 'lucide-react';
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
import { useAgentStore } from '@/stores/agent';
import {
  useFocusedCollaborationMode,
  useFocusedCollaborationStrategy,
} from '@/stores/agent-selectors';
import { SlashCommandMenu } from './SlashCommandMenu';
import { FileReferenceMenu } from './FileReferenceMenu';
import { PromptAttachmentsBar } from './ChatAttachments';
import { ModelSelector } from './ModelSelector';
import { AuthLoginDialog } from './AuthLoginDialog';
import { ContextEditor } from './ContextEditor';
import { VoiceTranscriptionControl } from './VoiceTranscriptionControl';
import { ContextEditorMenuItem, ThinkingBlocksToggle, MemoryBlocksToggle, CollaborationToggle } from './ChatPanelHelpers';
import { useMessageQueue } from '@/hooks/useMessageQueue';
import { useChatPromptInput } from '@/hooks/useChatPromptInput';

interface ChatPromptAreaProps {
  sessionId: string | null;
  isStreaming: boolean;
  focusedWorkspaceId: string | null;
}

export const ChatPromptArea = memo(function ChatPromptArea({
  sessionId,
  isStreaming,
  focusedWorkspaceId,
}: ChatPromptAreaProps) {
  const sendPrompt = useAgentStore((s) => s.sendPrompt);
  const sendCollaborationPrompt = useAgentStore((s) => s.sendCollaborationPrompt);
  const steerAgent = useAgentStore((s) => s.steerAgent);
  const abort = useAgentStore((s) => s.abort);
  const fetchModelState = useAgentStore((s) => s.fetchModelState);
  const collaborationMode = useFocusedCollaborationMode();
  const collaborationStrategy = useFocusedCollaborationStrategy();
  const hasSession = !!sessionId;

  // ── Login dialog state ─────────────────────────────────────
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<'login' | 'logout'>('login');

  const onLoginRequest = useCallback((mode: 'login' | 'logout') => {
    setLoginMode(mode);
    setLoginDialogOpen(true);
  }, []);

  const handleAuthComplete = useCallback(() => {
    if (sessionId) fetchModelState(sessionId);
  }, [sessionId, fetchModelState]);

  // ── Follow-up message queue ────────────────────────────────
  const messageQueue = useMessageQueue({ isStreaming, sessionId, sendPrompt });

  // ── Prompt input (slash, @file, tab-complete, submit) ──────
  const prompt = useChatPromptInput({
    sessionId,
    isStreaming,
    focusedWorkspaceId,
    sendPrompt,
    sendCollaborationPrompt,
    collaborationMode,
    steerAgent,
    messageQueue,
    onLoginRequest,
  });

  const handleTranscript = useCallback((text: string) => {
    const transcript = text.trim();
    if (!transcript) return;
    prompt.setInput((prev) => {
      if (!prev.trim()) return transcript;
      return `${prev}${prev.endsWith('\n') ? '' : '\n'}${transcript}`;
    });
  }, [prompt]);

  return (
    <>
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
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--status-info-muted)] px-2 py-0.5 text-[11px] text-[var(--status-info)]"
                  >
                    <span className="max-w-[150px] truncate">{msg.text}</span>
                    <button
                      onClick={() => messageQueue.dequeue(msg.id)}
                      className="shrink-0 rounded-full p-0.5 hover:bg-[var(--status-info-border)]"
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
              placeholder={
                hasSession
                  ? collaborationMode
                    ? collaborationStrategy === 'debate'
                      ? 'Debate Collaboration — agents will analyze, debate & synthesize…'
                      : '4-Agent Collaboration active — ask a complex question…'
                    : 'Ask Sero anything… (/ for commands, @ for files)'
                  : 'Select a chat first…'
              }
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
              <CollaborationToggle disabled={!hasSession} />
              <MemoryBlocksToggle disabled={!hasSession} />
              <ThinkingBlocksToggle disabled={!hasSession} />
              <ModelSelector disabled={!hasSession} />
            </PromptInputTools>

            {isStreaming ? (
              <div className="flex items-center gap-1.5">
                <PromptInputSubmit
                  disabled={!prompt.input.trim() || !hasSession}
                  onClick={(e) => { prompt.modifierRef.current = e.ctrlKey || e.metaKey; }}
                  title="Send to steer agent (⌘+click to queue as follow-up)"
                  className="bg-[var(--status-success)] text-white hover:bg-[var(--status-success)]/90"
                />
                <button
                  type="button"
                  onClick={() => sessionId && abort(sessionId)}
                  className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1 font-medium text-sm text-destructive hover:bg-destructive/20 transition-colors"
                >
                  <Loader2 className="size-3.5 animate-spin" />
                  Stop
                </button>
              </div>
            ) : (
              <PromptInputSubmit
                disabled={!prompt.input.trim() || !hasSession}
                className="bg-[var(--status-success)] text-white hover:bg-[var(--status-success)]/90"
              />
            )}
          </PromptInputFooter>
        </PromptInput>
      </div>

      <AuthLoginDialog
        open={loginDialogOpen}
        onOpenChange={setLoginDialogOpen}
        mode={loginMode}
        onComplete={handleAuthComplete}
      />

      {sessionId && <ContextEditor sessionId={sessionId} />}
    </>
  );
});
