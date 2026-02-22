/**
 * QuestionnaireNotice — replaces the ToolCallGroup rendering for a running
 * questionnaire or interview tool call. Clickable to switch to the User Feedback app.
 *
 * Rendered inline in the conversation where the tool call would normally appear.
 * Once the tool completes, ChatPanel falls back to the standard ToolCallGroup.
 */

import { useCallback } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, X } from 'lucide-react';
import { useUserFeedbackStore } from '@/stores/user-feedback-store';
import { useAppStore } from '@/stores/app';
import type { ChatToolCallMessage } from '@/types/ipc';

interface Props {
  tools: ChatToolCallMessage[];
}

export function QuestionnaireNotice({ tools }: Props) {
  const toolName = tools[0]?.toolName as 'questionnaire' | 'interview' | undefined;
  const isInterview = toolName === 'interview';
  const label = isInterview ? 'interview' : 'questionnaire';

  const cancel = useUserFeedbackStore((s) => s.cancel);
  const pending = useUserFeedbackStore(
    (s) => s.getPending(isInterview ? 'interview' : 'questionnaire'),
  );
  const setActiveApp = useAppStore((s) => s.setActiveApp);

  // Derive question count from tool input with validation
  const rawInput = tools[0]?.input;
  const questionsArr = rawInput && typeof rawInput === 'object' && 'questions' in rawInput
    ? (rawInput as { questions: unknown }).questions
    : undefined;
  const count = Array.isArray(questionsArr) ? questionsArr.length : 0;

  const handleClick = useCallback(() => {
    setActiveApp('userfeedback');
  }, [setActiveApp]);

  const handleCancel = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (pending) cancel(pending.id);
    },
    [pending, cancel],
  );

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={`Open ${label}${count > 0 ? ` with ${count} question${count !== 1 ? 's' : ''}` : ''} in User Feedback app`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
      className="cursor-pointer overflow-hidden rounded-lg border border-blue-500/20 bg-blue-500/[0.03] transition-colors hover:bg-blue-500/[0.06]"
    >
      <div className="flex items-center gap-2.5 px-3 py-2">
        <ChevronRight className="size-3.5 text-[var(--text-muted)]" />
        <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-blue-500 dark:bg-blue-400" />
        <span className="flex-1 text-xs font-medium text-[var(--text-secondary)]">
          {label}{count > 0 ? ` (${count} question${count !== 1 ? 's' : ''})` : ''}
          {' — switch to '}
          <strong className="text-[var(--text-primary)]">User Feedback</strong>
        </span>
        {pending && (
          <button
            onClick={handleCancel}
            aria-label={`Cancel ${label}`}
            className="rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
            title={`Cancel ${label}`}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </motion.div>
  );
}
