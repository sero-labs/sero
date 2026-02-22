/**
 * PendingQuestionCard — interactive single-question card for ChatPanel.
 *
 * Renders when the agent's `question` tool is waiting for user input.
 * Styled to match ToolCallGroup's visual language.
 */

import { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, X, Send } from 'lucide-react';
import { Button } from '@sero/ui/components/ui/button';
import { cn } from '@sero/ui/lib/utils';
import { useUserFeedbackStore } from '@/stores/user-feedback-store';
import type { UserFeedbackPendingQuestion, UserFeedbackAnswer } from '@/types/ipc';

export function PendingQuestionCard() {
  const pending = useUserFeedbackStore((s) => s.getPending('question'));
  if (!pending) return null;
  return <QuestionCardInner question={pending} />;
}

function QuestionCardInner({ question }: { question: UserFeedbackPendingQuestion }) {
  const answer = useUserFeedbackStore((s) => s.answer);
  const cancel = useUserFeedbackStore((s) => s.cancel);
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');

  const q = question.questions[0];
  if (!q) return null;

  const handleSelect = useCallback(
    (opt: { value: string; label: string }, index: number) => {
      const ans: UserFeedbackAnswer = {
        questionId: q.id,
        value: opt.value,
        label: opt.label,
        wasCustom: false,
        index: index + 1,
      };
      answer(question.id, [ans]);
    },
    [q.id, question.id, answer],
  );

  const handleCustomSubmit = useCallback(() => {
    const text = customText.trim();
    if (!text) return;
    const ans: UserFeedbackAnswer = {
      questionId: q.id,
      value: text,
      label: text,
      wasCustom: true,
    };
    answer(question.id, [ans]);
  }, [q.id, question.id, customText, answer]);

  const handleCancel = useCallback(() => {
    cancel(question.id);
  }, [question.id, cancel]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.2 }}
      className="mx-3 mb-2 overflow-hidden rounded-lg border border-blue-500/20 bg-blue-500/[0.03]"
    >
      {/* Header — matches ToolCallGroup summary bar */}
      <div className="flex items-center gap-2.5 px-3 py-2">
        <ChevronRight className="size-3.5 text-[var(--text-muted)]" />
        <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-blue-500 dark:bg-blue-400" />
        <span className="flex-1 text-xs font-medium text-[var(--text-secondary)]">
          question
        </span>
        <button
          onClick={handleCancel}
          aria-label="Cancel question"
          className="rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
          title="Cancel"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Question content */}
      <div className="border-t border-[var(--border-subtle)] px-3 pt-2.5 pb-1">
        <p className="text-sm text-[var(--text-primary)]">{q.prompt}</p>
      </div>

      {/* Options */}
      <div className="space-y-0.5 px-2 py-2">
        {q.options.map((opt, i) => (
          <button
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
          <button
            onClick={() => setCustomMode(true)}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-[var(--bg-elevated)]/80"
          >
            <span className="mt-px text-[11px] text-[var(--text-muted)]">✎</span>
            <span className="text-[13px] text-[var(--text-muted)]">Type something…</span>
          </button>
        )}

        {/* Custom text input */}
        {customMode && (
          <div className="flex gap-1.5 px-0.5 pt-1">
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
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
              className="flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2.5 py-1 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-blue-500/40"
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
