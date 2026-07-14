/**
 * PendingQuestionCard, interactive card for ChatPanel.
 *
 * Renders for two pending question types:
 *   - `question`, standard blue-themed option picker
 *   - `permission`, warning-styled amber/red card for dangerous command approval
 *
 * Styled to match ToolCallGroup's visual language.
 */

import { useState, useCallback, useEffect } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, ChevronRight, ExternalLink, Pencil, X, Send, ShieldAlert } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@sero-ai/ui/components/ui/dropdown-menu';
import { openSeroApp } from '@sero-ai/app-runtime';
import { IconAction } from '@/components/ui/IconAction';
import { cn } from '@sero-ai/ui/lib/utils';
import { useUserFeedbackStore } from '@/stores/user-feedback-store';
import { useWorkspaceStore } from '@/stores/workspace';
import type { UserFeedbackPendingQuestion, UserFeedbackAnswer } from '@/types/ipc';

export function PendingQuestionCard() {
  const questionPending = useUserFeedbackStore((s) => s.getPending('question'));
  const permissionPending = useUserFeedbackStore((s) => s.getPending('permission'));

  // Permission gates take priority, show them first
  const pending = permissionPending ?? questionPending;
  if (!pending) return null;

  if (pending.type === 'permission') {
    return <PermissionGateCard question={pending} />;
  }
  return <QuestionCardInner question={pending} />;
}

// ── Permission Gate Card (warning style) ─────────────────────────

function PermissionGateCard({ question }: { question: UserFeedbackPendingQuestion }) {
  const answer = useUserFeedbackStore((s) => s.answer);
  const cancel = useUserFeedbackStore((s) => s.cancel);

  const q = question.questions[0];
  const qId = q?.id;

  const handleAllow = useCallback(() => {
    if (!qId) return;
    const ans: UserFeedbackAnswer = {
      questionId: qId,
      value: 'allow',
      label: 'Allow',
      wasCustom: false,
      index: 1,
    };
    answer(question.id, [ans]);
  }, [qId, question.id, answer]);

  const handleBlock = useCallback(() => {
    if (!qId) return;
    const ans: UserFeedbackAnswer = {
      questionId: qId,
      value: 'block',
      label: 'Block',
      wasCustom: false,
      index: 2,
    };
    answer(question.id, [ans]);
  }, [qId, question.id, answer]);

  const handleCancel = useCallback(() => {
    cancel(question.id);
  }, [question.id, cancel]);

  if (!q) return null;

  // Extract the command from the prompt (between the two newlines after "detected:")
  const commandMatch = q.prompt.match(/:\n\n\s+(.+)\n\n/);
  const command = commandMatch?.[1]?.trim() ?? q.prompt;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.2 }}
      className="mx-3 mb-2 overflow-hidden rounded-lg border border-status-warning-border bg-status-warning-muted"
    >
      {/* Warning header */}
      <div className="flex items-center gap-2.5 px-3 py-2">
        <ShieldAlert className="size-3.5 text-status-warning" />
        <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-status-warning" />
        <span className="flex-1 text-xs font-semibold text-status-warning">
          dangerous command, approval required
        </span>
        <button type="button"
          onClick={handleCancel}
          aria-label="Block command"
          className="rounded p-0.5 text-[var(--text-muted)] hover:bg-status-warning-muted hover:text-status-warning"
          title="Block (cancel)"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Command display */}
      <div className="border-t border-status-warning-border px-3 pt-2.5 pb-2">
        <code className="block whitespace-pre-wrap break-all rounded-md border border-status-error-border bg-status-error-muted px-2.5 py-1.5 font-mono text-base leading-relaxed text-status-error">
          {command}
        </code>
      </div>

      {/* Allow / Block buttons */}
      <div className="flex items-center gap-2 border-t border-status-warning-border px-3 py-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleAllow}
          className="h-7 gap-1.5 border border-status-warning-border px-3 text-xs font-medium text-status-warning hover:bg-status-warning-muted"
        >
          Allow
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleBlock}
          className="h-7 gap-1.5 border border-status-error-border bg-status-error-muted px-3 text-xs font-medium text-status-error hover:bg-status-error-subtle"
        >
          Block
        </Button>
        <span className="ml-auto text-sm text-[var(--text-muted)]">
          Esc to block
        </span>
      </div>
    </motion.div>
  );
}

// ── Standard Question Card ───────────────────────────────────────

function QuestionCardInner({ question }: { question: UserFeedbackPendingQuestion }) {
  const answer = useUserFeedbackStore((s) => s.answer);
  const cancel = useUserFeedbackStore((s) => s.cancel);
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');

  const q = question.questions[0];
  const qId = q?.id;
  const workspaceName = useWorkspaceStore((state) =>
    state.workspaces.find((workspace) => workspace.id === question.context?.workspaceId)?.name,
  );
  const workspaceLabel = workspaceName ?? question.context?.workspaceId;
  const remainingSeconds = useRemainingSeconds(question.expiresAt);

  const handleSelect = useCallback(
    (opt: { value: string; label: string }, index: number) => {
      if (!qId) return;
      const ans: UserFeedbackAnswer = {
        questionId: qId,
        value: opt.value,
        label: opt.label,
        wasCustom: false,
        index: index + 1,
      };
      answer(question.id, [ans]);
    },
    [qId, question.id, answer],
  );

  const handleCustomSubmit = useCallback(() => {
    if (!qId) return;
    const text = customText.trim();
    if (!text) return;
    const ans: UserFeedbackAnswer = {
      questionId: qId,
      value: text,
      label: text,
      wasCustom: true,
    };
    answer(question.id, [ans]);
  }, [qId, question.id, customText, answer]);

  const handleCancel = useCallback(() => {
    cancel(question.id);
  }, [question.id, cancel]);

  const handleOpen = useCallback(() => {
    const target = question.openTarget;
    if (!target) return;
    if (target.workspaceId) useWorkspaceStore.getState().setActiveWorkspace(target.workspaceId);
    void openSeroApp(target.appId, target.params);
  }, [question.openTarget]);

  if (!q) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.2 }}
      className="mx-3 mb-2 overflow-hidden rounded-lg border border-status-info-border bg-status-info-faint"
    >
      {/* Header, matches ToolCallGroup summary bar */}
      <div className="flex items-center gap-2.5 px-3 py-2">
        <ChevronRight className="size-3.5 text-[var(--text-muted)]" />
        <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-status-info" />
        <span className="flex-1 truncate text-xs font-medium text-[var(--text-secondary)]">
          {question.context?.source ?? 'question'}
          {question.context?.trigger ? ` · ${question.context.trigger}` : ''}
        </span>
        <IconAction
          onClick={handleCancel}
          aria-label="Cancel question"
          className="hover:bg-[var(--bg-elevated)]"
          title="Cancel"
        >
          <X className="size-3.5" />
        </IconAction>
      </div>

      {/* Question content */}
      <div className="border-t border-[var(--border-subtle)] px-3 pt-2.5 pb-1">
        <div className="mb-1 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-base font-semibold text-[var(--text-primary)]">{q.label}</p>
          {workspaceLabel && (
            <span className="max-w-[45%] truncate rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-sm text-[var(--text-muted)]">
              {workspaceLabel}
            </span>
          )}
        </div>
        <p className="text-base text-[var(--text-primary)]">{q.prompt}</p>
      </div>

      {/* Options */}
      <div className="space-y-0.5 p-2">
        {isContextualChoice(question) ? (
          <ContextualChoiceActions question={question} onSelect={handleSelect} onOpen={handleOpen} />
        ) : (
          q.options.map((opt, i) => (
            <button type="button"
              key={opt.value}
              onClick={() => handleSelect(opt, i)}
              className={cn(
                'flex w-full items-start gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors',
                'hover:bg-[var(--bg-elevated)]/80',
              )}
            >
              <span className="mt-px text-sm font-medium text-[var(--text-muted)]">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <span className="text-base text-[var(--text-primary)]">{opt.label}</span>
                {opt.description && <p className="mt-0.5 text-sm text-[var(--text-muted)]">{opt.description}</p>}
              </div>
            </button>
          ))
        )}

        {/* "Type something" option */}
        {q.allowOther && !customMode && (
          <button type="button"
            onClick={() => setCustomMode(true)}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-[var(--bg-elevated)]/80"
          >
            <Pencil className="size-3 text-[var(--text-muted)]" />
            <span className="text-base text-[var(--text-muted)]">Type something…</span>
          </button>
        )}

        {/* Custom text input */}
        {customMode && (
          <div className="flex gap-1.5 px-0.5 pt-1">
            <input aria-label="Custom answer"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCustomSubmit();
                if (e.key === 'Escape') {
                  setCustomMode(false);
                  setCustomText('');
                }
              }}
              placeholder="Type your answer…"
              className="flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2.5 py-1 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-status-info-border"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCustomSubmit}
              disabled={!customText.trim()}
              aria-label="Submit custom answer"
              className="h-7 px-2 text-[var(--text-secondary)]"
            >
              <Send className="size-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setCustomMode(false); setCustomText(''); }}
              aria-label="Cancel custom input"
              className="h-7 px-2 text-[var(--text-muted)]"
            >
              <X className="size-3" />
            </Button>
          </div>
        )}

        {(question.fallbackLabel || remainingSeconds !== null) && (
          <p className="px-2 pt-1 text-sm text-[var(--text-muted)]">
            No response: {question.fallbackLabel ?? 'continues automatically'}
            {remainingSeconds !== null ? ` in ${formatCountdown(remainingSeconds)}` : ''}
          </p>
        )}
      </div>
    </motion.div>
  );
}

function isContextualChoice(question: UserFeedbackPendingQuestion): boolean {
  const options = question.questions[0]?.options ?? [];
  return Boolean(question.context || question.openTarget || options.some((option) => option.menu || option.emphasis));
}

function ContextualChoiceActions({
  question,
  onSelect,
  onOpen,
}: {
  question: UserFeedbackPendingQuestion;
  onSelect: (option: { value: string; label: string }, index: number) => void;
  onOpen: () => void;
}) {
  const options = question.questions[0]?.options ?? [];
  const direct: typeof options = [];
  const grouped = new Map<string, typeof options>();
  for (const option of options) {
    if (!option.menu) {
      direct.push(option);
      continue;
    }
    const group = grouped.get(option.menu) ?? [];
    group.push(option);
    grouped.set(option.menu, group);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 py-1">
      {direct.map((option) => {
        const index = options.indexOf(option);
        return (
          <Button
            key={option.value}
            size="sm"
            variant={option.emphasis === 'primary' ? 'default' : 'outline'}
            onClick={() => onSelect(option, index)}
            title={option.description}
            className="h-7 text-xs"
          >
            {option.label}
          </Button>
        );
      })}
      {Array.from(grouped.entries()).map(([menu, menuOptions]) => (
        <DropdownMenu key={menu}>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
              {menu} <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-w-72">
            {menuOptions.map((option) => {
              const index = options.indexOf(option);
              return (
                <DropdownMenuItem key={option.value} onSelect={() => onSelect(option, index)} className="flex flex-col items-start">
                  <span>{option.label}</span>
                  {option.description && <span className="text-sm text-muted-foreground">{option.description}</span>}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
      {question.openTarget && (
        <Button size="sm" variant="ghost" className="ml-auto h-7 gap-1 text-xs" onClick={onOpen}>
          {question.openTarget.label ?? 'Open'} <ExternalLink className="size-3" />
        </Button>
      )}
    </div>
  );
}

function useRemainingSeconds(expiresAt?: string): number | null {
  const [remaining, setRemaining] = useState<number | null>(() => secondsUntil(expiresAt));
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => setRemaining(secondsUntil(expiresAt));
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  return remaining;
}

function secondsUntil(expiresAt?: string): number | null {
  if (!expiresAt) return null;
  const expires = Date.parse(expiresAt);
  if (Number.isNaN(expires)) return null;
  return Math.max(0, Math.ceil((expires - Date.now()) / 1_000));
}

function formatCountdown(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
