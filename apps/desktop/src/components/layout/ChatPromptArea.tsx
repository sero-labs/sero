/**
 * ChatPromptArea, extracted from ChatPanel so the prompt input tree
 * doesn't re-render on every streaming token.
 *
 * Subscribes to store selectors that return primitives (sessionId,
 * isStreaming, workspaceId) so Zustand's Object.is
 * check keeps this stable during text streaming.
 */

import { memo, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import {
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
} from '@sero-ai/ui/ai-elements/prompt-input';
import { ChatComposer } from './ChatComposer';
import { useAgentStore } from '@/stores/agent';
import { SlashCommandMenu } from './SlashCommandMenu';
import { FileReferenceMenu } from './FileReferenceMenu';
import { PromptAttachmentsBar } from './ChatAttachments';
import { ComposerAttachmentBridge } from './ComposerAttachmentBridge';
import { ModelSelector } from './models/ModelSelector';
import { AuthLoginDialog } from './auth/AuthLoginDialog';
import { ContextEditor } from './ContextEditor';
import { VoiceTranscriptionControl } from './VoiceTranscriptionControl';
import { ModelExtensionActions } from './ModelExtensionActions';
import { ContextEditorMenuItem, ThinkingBlocksToggle, MemoryBlocksToggle } from './ChatPanelHelpers';
import { WorkspaceSnapshotMenuItem } from './WorkspaceSnapshotMenuItem';
import { useMessageQueue } from '@/hooks/useMessageQueue';
import { useChatPromptInput } from '@/hooks/useChatPromptInput';
import type { ChatComposerPrefill } from '@/types/ipc';

interface ChatPromptAreaProps {
  sessionId: string | null;
  isStreaming: boolean;
  focusedWorkspaceId: string | null;
  externalDraft?: ChatComposerPrefill | null;
  onExternalDraftApplied?: (draft: ChatComposerPrefill) => void;
}

export const ChatPromptArea = memo(function ChatPromptArea({
  sessionId,
  isStreaming,
  focusedWorkspaceId,
  externalDraft,
  onExternalDraftApplied,
}: ChatPromptAreaProps) {
  const sendPrompt = useAgentStore((s) => s.sendPrompt);
  const steerAgent = useAgentStore((s) => s.steerAgent);
  const abort = useAgentStore((s) => s.abort);
  const fetchModelState = useAgentStore((s) => s.fetchModelState);
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
    steerAgent,
    messageQueue,
    onLoginRequest,
    externalDraft,
    onExternalDraftApplied,
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
      <ChatComposer
        value={prompt.input}
        onChange={(event) => prompt.setInput(event.target.value)}
        onKeyDown={prompt.handleKeyDown}
        onSubmit={prompt.handleSubmit}
        textareaRef={prompt.textareaRef}
        placeholder={hasSession
          ? 'Ask Sero anything... (/ for commands, @ for files)'
          : 'Select a chat first...'}
        disabled={!hasSession}
        isStreaming={isStreaming}
        onStop={() => {
          if (sessionId) abort(sessionId);
        }}
        onSubmitClick={(event) => {
          prompt.modifierRef.current = event.ctrlKey || event.metaKey;
        }}
        submitTitle={isStreaming
          ? 'Send to steer agent (⌘+click to queue as follow-up)'
          : undefined}
        overlays={(
          <>
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
          </>
        )}
        inputChildren={<ComposerAttachmentBridge />}
        header={(
          <>
            <PromptAttachmentsBar />
            {messageQueue.hasQueued && (
              <div className="flex flex-wrap gap-1 px-1">
                {messageQueue.queue.map((msg) => (
                  <span
                    key={msg.id}
                    className="inline-flex items-center gap-1 rounded-full bg-status-info-muted px-2 py-0.5 text-sm text-status-info"
                  >
                    <span className="max-w-[150px] truncate">{msg.text}</span>
                    <button type="button"
                      onClick={() => messageQueue.dequeue(msg.id)}
                      className="shrink-0 rounded-full p-0.5 hover:bg-status-info-border"
                      title="Remove queued message"
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
        tools={(
          <>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger
                tooltip={{ content: 'Actions', shortcut: '' }}
                disabled={!hasSession}
              />
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments />
                <WorkspaceSnapshotMenuItem disabled={isStreaming || !hasSession} />
                <ContextEditorMenuItem sessionId={sessionId} disabled={isStreaming} />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
            <VoiceTranscriptionControl
              disabled={!hasSession || isStreaming}
              onTranscript={handleTranscript}
            />
            <MemoryBlocksToggle disabled={!hasSession} />
            <ThinkingBlocksToggle disabled={!hasSession} />
            <ModelExtensionActions sessionId={sessionId} />
            <ModelSelector disabled={!hasSession} />
          </>
        )}
        multiple
        globalDrop={hasSession}
      />

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
