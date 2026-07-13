/**
 * Small helper components extracted from ChatPanel to keep it under 500 LOC.
 *
 * - ContextEditorMenuItem, "+" menu item that opens the context editor
 * - ThinkingBlocksToggle, toggle visibility of thinking blocks
 * - CollaborationToggle, toggle collaboration mode + strategy picker
 * - EmptyState, placeholder when no session / no messages
 * - ThinkingIndicator, shared inline streaming indicator
 */

import { useRef, useState, useCallback } from 'react';
import { Settings2, Brain, Database, MessageSquare, Users, Swords, ChevronDown, Loader2 } from 'lucide-react';
import {
  PromptInputActionMenuItem,
} from '@sero-ai/ui/components/ai-elements/prompt-input';
import { useAgentStore } from '@/stores/agent';
import {
  useFocusedAgent,
  useFocusedCollaborationMode,
  useFocusedCollaborationStrategy,
  useFocusedDebateConfig,
} from '@/stores/agent-selectors';
import { useContextEditorStore, useHasOverrides } from '@/stores/context-editor';
import { cn } from '@sero-ai/ui/lib/utils';
import type { CollaborationStrategy } from '@/types/collaboration';

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
  const focused = useFocusedAgent();
  const showThinking = useAgentStore((s) => s.showThinkingBlocks);
  const toggle = useAgentStore((s) => s.toggleThinkingBlocks);

  const isReasoning = focused?.modelState?.model.reasoning ?? false;
  const thinkingLevel = focused?.modelState?.thinkingLevel ?? 'off';
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

// ── Collaboration mode toggle + strategy picker ─────────────────

const STRATEGY_OPTIONS: Array<{ value: CollaborationStrategy; label: string; icon: typeof Users; description: string }> = [
  {
    value: 'standard',
    label: 'Standard',
    icon: Users,
    description: 'Research → Analyze → Synthesize',
  },
  {
    value: 'debate',
    label: 'Debate',
    icon: Swords,
    description: 'Decompose → Analyze → Debate → Consensus',
  },
];

export function CollaborationToggle({ disabled }: { disabled: boolean }) {
  const isActive = useFocusedCollaborationMode();
  const strategy = useFocusedCollaborationStrategy();
  const debateConfig = useFocusedDebateConfig();
  const toggle = useAgentStore((s) => s.toggleCollaborationMode);
  const setStrategy = useAgentStore((s) => s.setCollaborationStrategy);
  const setDebateConfig = useAgentStore((s) => s.setDebateConfig);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleToggle = useCallback(() => {
    toggle();
  }, [toggle]);

  const handleStrategyChange = useCallback((value: CollaborationStrategy) => {
    setStrategy(value);
  }, [setStrategy]);

  const handleRoundsChange = useCallback((rounds: number) => {
    setDebateConfig({ maxRounds: Math.max(1, Math.min(5, rounds)) });
  }, [setDebateConfig]);

  const handleTimeLimitChange = useCallback((seconds: number) => {
    setDebateConfig({ timeLimitSec: Math.max(30, Math.min(600, seconds)) });
  }, [setDebateConfig]);

  const activeOption = STRATEGY_OPTIONS.find((o) => o.value === strategy) ?? STRATEGY_OPTIONS[0];
  const ActiveIcon = activeOption.icon;

  return (
    <div ref={containerRef} className="relative flex items-center">
      {/* Main toggle button */}
      <button type="button"
        onClick={handleToggle}
        disabled={disabled}
        title={isActive ? `Disable collaboration (${activeOption.label})` : 'Enable collaboration mode'}
        className={cn(
          'rounded-md p-1.5 transition-colors duration-150',
          isActive
            ? 'bg-[var(--collab-primary-subtle)] text-[var(--collab-primary)]'
            : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]',
          'disabled:pointer-events-none disabled:opacity-40',
        )}
      >
        <ActiveIcon className="size-3.5" />
      </button>

      {/* Strategy dropdown trigger (only visible when collaboration is active) */}
      {isActive && (
        <button type="button"
          onClick={() => setPopoverOpen(!popoverOpen)}
          disabled={disabled}
          className="ml-[-2px] rounded-md p-0.5 text-[var(--collab-primary)] hover:bg-[var(--collab-primary-muted)]"
          title="Change collaboration strategy"
        >
          <ChevronDown className="size-2.5" />
        </button>
      )}

      {/* Strategy picker popover, fixed positioning to escape overflow:hidden on InputGroup */}
      {popoverOpen && (
        <>
          {/* Backdrop */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events,jsx-a11y/no-static-element-interactions */}
          <div className="fixed inset-0 z-40" onClick={() => setPopoverOpen(false)} />
          <div
            className="fixed z-50 w-56 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-2 shadow-lg"
            style={(() => {
              const rect = containerRef.current?.getBoundingClientRect();
              if (!rect) return {};
              return { bottom: window.innerHeight - rect.top + 4, right: window.innerWidth - rect.right };
            })()}
          >
            <div className="mb-2 text-sm font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Strategy
            </div>

            {STRATEGY_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <button type="button"
                  key={option.value}
                  onClick={() => handleStrategyChange(option.value)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors',
                    strategy === option.value
                      ? 'bg-[var(--collab-primary-subtle)] text-[var(--collab-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]',
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium">{option.label}</div>
                    <div className="text-sm text-[var(--text-muted)]">{option.description}</div>
                  </div>
                  {strategy === option.value && (
                    <div className="ml-auto size-1.5 rounded-full bg-[var(--collab-primary)]" />
                  )}
                </button>
              );
            })}

            {/* Debate config (only when debate is selected) */}
            {strategy === 'debate' && debateConfig && (
              <div className="mt-2 border-t border-[var(--border-default)] pt-2">
                <div className="mb-1.5 text-sm font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  Debate Settings
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center justify-between text-sm text-[var(--text-secondary)]">
                    <span>Max rounds</span>
                    <input aria-label="Max collaboration rounds"
                      type="number"
                      min={1}
                      max={5}
                      value={debateConfig.maxRounds}
                      onChange={(e) => handleRoundsChange(parseInt(e.target.value, 10))}
                      className="w-12 rounded border border-[var(--border-default)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-center text-sm text-[var(--text-primary)]"
                    />
                  </label>
                  <label className="flex items-center justify-between text-sm text-[var(--text-secondary)]">
                    <span>Time limit (sec)</span>
                    <input aria-label="Collaboration time limit in seconds"
                      type="number"
                      min={30}
                      max={600}
                      step={30}
                      value={debateConfig.timeLimitSec}
                      onChange={(e) => handleTimeLimitChange(parseInt(e.target.value, 10))}
                      className="w-12 rounded border border-[var(--border-default)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-center text-sm text-[var(--text-primary)]"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
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

// ── Empty state ────────────────────────────────────────────────

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <MessageSquare className="size-8 text-[var(--text-muted)]" />
      <span className="text-xs text-[var(--text-muted)]">{message}</span>
    </div>
  );
}
