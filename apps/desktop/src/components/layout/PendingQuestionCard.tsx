/**
 * PendingQuestionCard, interactive card for ChatPanel.
 *
 * Renders for two pending question types:
 *   - `question`, standard blue-themed option picker
 *   - `permission`, warning-styled amber/red card for dangerous command approval
 *
 * Styled to match ToolCallGroup's visual language.
 */

import { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Pencil, X, Send, ShieldAlert } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { IconAction } from '@/components/ui/IconAction';
import { cn } from '@sero-ai/ui/lib/utils';
import { useUserFeedbackStore } from '@/stores/user-feedback-store';
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
      className="mx-3 mb-2 overflow-hidden rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-muted)]"
    >
      {/* Warning header */}
      <div className="flex items-center gap-2.5 px-3 py-2">
        <ShieldAlert className="size-3.5 text-[var(--status-warning)]" />
        <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-[var(--status-warning)]" />
        <span className="flex-1 text-xs font-semibold text-[var(--status-warning)]">
          dangerous command, approval required
        </span>
        <button type="button"
          onClick={handleCancel}
          aria-label="Block command"
          className="rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--status-warning-muted)] hover:text-[var(--status-warning)]"
          title="Block (cancel)"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Command display */}
      <div className="border-t border-[var(--status-warning-border)] px-3 pt-2.5 pb-2">
        <code className="block whitespace-pre-wrap break-all rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-muted)] px-2.5 py-1.5 font-mono text-[12px] leading-relaxed text-[var(--status-error)]">
          {command}
        </code>
      </div>

      {/* Allow / Block buttons */}
      <div className="flex items-center gap-2 border-t border-[var(--status-warning-border)] px-3 py-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleAllow}
          className="h-7 gap-1.5 border border-[var(--status-warning-border)] px-3 text-xs font-medium text-[var(--status-warning)] hover:bg-[var(--status-warning-muted)]"
        >
          Allow
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleBlock}
          className="h-7 gap-1.5 border border-[var(--status-error-border)] bg-[var(--status-error-muted)] px-3 text-xs font-medium text-[var(--status-error)] hover:bg-[var(--status-error-subtle)]"
        >
          Block
        </Button>
        <span className="ml-auto text-[10px] text-[var(--text-muted)]">
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

  if (!q) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.2 }}
      className="mx-3 mb-2 overflow-hidden rounded-lg border border-[var(--status-info-border)] bg-[var(--status-info-faint)]"
    >
      {/* Header, matches ToolCallGroup summary bar */}
      <div className="flex items-center gap-2.5 px-3 py-2">
        <ChevronRight className="size-3.5 text-[var(--text-muted)]" />
        <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-[var(--status-info)]" />
        <span className="flex-1 text-xs font-medium text-[var(--text-secondary)]">
          question
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
        <p className="text-sm text-[var(--text-primary)]">{q.prompt}</p>
      </div>

      {/* Options */}
      <div className="space-y-0.5 p-2">
        {q.options.map((opt, i) => (
          <button type="button"
            key={opt.value}
            onClick={() => handleSelect(opt, i)}
            className={cn(
              'flex w-full items-start gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors',
              'hover:bg-[var(--bg-elevated)]/80',
            )}
          >
            <span className="mt-px text-[11px] font-medium text-[var(--text-muted)]">
              {i + 1}.
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-[13px] text-[var(--text-primary)]">{opt.label}</span>
              {opt.description && (
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{opt.description}</p>
              )}
            </div>
          </button>
        ))}

        {/* "Type something" option */}
        {q.allowOther && !customMode && (
          <button type="button"
            onClick={() => setCustomMode(true)}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-[var(--bg-elevated)]/80"
          >
            <Pencil className="size-3 text-[var(--text-muted)]" />
            <span className="text-[13px] text-[var(--text-muted)]">Type something…</span>
          </button>
        )}

        {/* Custom text input */}
        {customMode && (
          <div className="flex gap-1.5 px-0.5 pt-1">
            <input aria-label="Text input"
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
              className="flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2.5 py-1 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--status-info-border)]"
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
      </div>
    </motion.div>
  );
}
