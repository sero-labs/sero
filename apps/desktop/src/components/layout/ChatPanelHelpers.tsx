/**
 * Small helper components extracted from ChatPanel to keep it under 500 LOC.
 *
 * - ContextEditorMenuItem — "+" menu item that opens the context editor
 * - ThinkingBlocksToggle — toggle visibility of thinking blocks
 * - EmptyState — placeholder when no session / no messages
 */

import { Settings2, Brain, MessageSquare, Users } from 'lucide-react';
import {
  PromptInputActionMenuItem,
} from '@sero/ui/components/ai-elements/prompt-input';
import { useAgentStore } from '@/stores/agent';
import {
  useFocusedAgent,
  useFocusedCollaborationMode,
} from '@/stores/agent-selectors';
import { useContextEditorStore, useHasOverrides } from '@/stores/context-editor';
import { cn } from '@sero/ui/lib/utils';

// ── Context editor menu item ───────────────────────────────────

export function ContextEditorMenuItem({
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

export function ThinkingBlocksToggle({ disabled }: { disabled: boolean }) {
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
          ? 'bg-[var(--status-warning-subtle)] text-[var(--status-warning)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]',
        'disabled:pointer-events-none disabled:opacity-40',
      )}
    >
      <Brain className="size-3.5" />
    </button>
  );
}

// ── Collaboration mode toggle ──────────────────────────────────

export function CollaborationToggle({ disabled }: { disabled: boolean }) {
  const isActive = useFocusedCollaborationMode();
  const toggle = useAgentStore((s) => s.toggleCollaborationMode);

  return (
    <button
      onClick={toggle}
      disabled={disabled}
      title={isActive ? 'Disable 4-agent collaboration mode' : 'Enable 4-agent collaboration mode'}
      className={cn(
        'rounded-md p-1.5 transition-colors duration-150',
        isActive
          ? 'bg-[var(--collab-primary-subtle)] text-[var(--collab-primary)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]',
        'disabled:pointer-events-none disabled:opacity-40',
      )}
    >
      <Users className="size-3.5" />
    </button>
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
