/**
 * Small helper components extracted from ChatPanel to keep it under 500 LOC.
 *
 * - ContextEditorMenuItem, "+" menu item that opens the context editor
 * - ThinkingBlocksToggle, toggle visibility of thinking blocks
 * - EmptyState, placeholder when no session / no messages
 * - ThinkingIndicator, shared inline streaming indicator
 * - RetryIndicator, provider retry status
 */

import { Settings2, Brain, Database, MessageSquare, Loader2 } from 'lucide-react';
import {
  PromptInputActionMenuItem,
} from '@sero-ai/ui/ai-elements/prompt-input';
import { useAgentStore } from '@/stores/agent';
import { useFocusedModelState } from '@/stores/agent-selectors';
import { useContextEditorStore, useHasOverrides } from '@/stores/context-editor';
import { cn } from '@sero-ai/ui/lib/utils';
import type { AgentRetryState } from '@/stores/agent-types';

// ── Context editor menu item ───────────────────────────────────

export function ContextEditorMenuItem({
  sessionId,
  disabled,
}: {
  sessionId: string | null;
  disabled?: boolean;
}) {
  const openEditor = useContextEditorStore((s) => s.open);
  const loadedSessionId = useContextEditorStore((s) => s.loadedSessionId);
  const hasOverrides = useHasOverrides();
  const showOverrideIndicator = !!sessionId && loadedSessionId === sessionId && hasOverrides;

  return (
    <PromptInputActionMenuItem
      disabled={disabled || !sessionId}
      onSelect={(e) => {
        e.preventDefault();
        if (sessionId) openEditor(sessionId);
      }}
      className='text-sm'
    >
      <Settings2 className="size-4" />
      Session context
      {showOverrideIndicator && (
        <span className="ml-auto size-1.5 rounded-full bg-[var(--accent-primary)]" />
      )}
    </PromptInputActionMenuItem>
  );
}

// ── Thinking blocks toggle ─────────────────────────────────────

export function ThinkingBlocksToggle({ disabled }: { disabled: boolean }) {
  const modelState = useFocusedModelState();
  const showThinking = useAgentStore((s) => s.showThinkingBlocks);
  const toggle = useAgentStore((s) => s.toggleThinkingBlocks);

  const isReasoning = modelState?.model.reasoning ?? false;
  const thinkingLevel = modelState?.thinkingLevel ?? 'off';
  const isActive = isReasoning && thinkingLevel !== 'off';

  return (
    <button type="button"
      onClick={toggle}
      disabled={disabled || !isActive}
      title={showThinking ? 'Hide thinking blocks' : 'Show thinking blocks'}
      className={cn(
        'rounded-md p-1.5 transition-colors duration-150',
        showThinking && isActive
          ? 'bg-status-warning-subtle text-status-warning'
          : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]',
        'disabled:pointer-events-none disabled:opacity-40',
      )}
    >
      <Brain className="size-3.5" />
    </button>
  );
}

// ── Memory blocks toggle ────────────────────────────────────────

export function MemoryBlocksToggle({ disabled }: { disabled: boolean }) {
  const showMemory = useAgentStore((s) => s.showMemoryBlocks);
  const toggle = useAgentStore((s) => s.toggleMemoryBlocks);

  return (
    <button type="button"
      onClick={toggle}
      disabled={disabled}
      title={showMemory ? 'Hide memory context' : 'Show memory context'}
      className={cn(
        'rounded-md p-1.5 transition-colors duration-150',
        showMemory
          ? 'bg-[var(--accent-primary-subtle,var(--bg-elevated))] text-[var(--accent-primary)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]',
        'disabled:pointer-events-none disabled:opacity-40',
      )}
    >
      <Database className="size-3.5" />
    </button>
  );
}

// ── Shared streaming indicator ────────────────────────────────

export function ThinkingIndicator({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 px-2 py-1', className)}>
      <Loader2 className="size-3.5 animate-spin text-[var(--text-muted)]" />
      <span className="text-xs text-[var(--text-muted)]">Thinking…</span>
    </div>
  );
}

export function RetryIndicator({ retry }: { retry: AgentRetryState }) {
  const delaySeconds = Math.max(1, Math.ceil(retry.delayMs / 1000));
  return (
    <div
      className="flex items-center gap-2 px-2 py-1 text-status-warning"
      role="status"
      aria-live="polite"
      title={retry.errorMessage}
    >
      <Loader2 className="size-3.5 animate-spin" />
      <span className="text-xs">
        Retrying {retry.attempt} of {retry.maxAttempts} in {delaySeconds}s…
      </span>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <MessageSquare className="size-8 text-[var(--text-muted)]" />
      <span className="text-xs text-[var(--text-muted)]">{message}</span>
    </div>
  );
}
