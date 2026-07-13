/**
 * InterviewForm, single-page interview form for the Sero app UI.
 *
 * Shows all questions at once in a scrollable layout. Each question
 * has a text input that auto-grows. Submit when ready, skip any question.
 * Emerald-green Sero styling throughout.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import type {
  UserFeedbackPendingQuestion,
  UserFeedbackQuestionItem,
  UserFeedbackAnswer,
} from './types';

interface Props {
  question: UserFeedbackPendingQuestion;
  onSubmit: (id: string, answers: UserFeedbackAnswer[]) => void;
  onCancel: (id: string) => void;
}

export function InterviewForm({ question, onSubmit, onCancel }: Props) {
  const questions = question.questions;
  const [answers, setAnswers] = useState<Map<string, string>>(new Map());
  const firstRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  const answeredCount = [...answers.values()].filter((v) => v.trim().length > 0).length;

  const setAnswer = useCallback((qId: string, text: string) => {
    setAnswers((prev) => new Map(prev).set(qId, text));
  }, []);

  const handleSubmit = useCallback(() => {
    const result: UserFeedbackAnswer[] = [];
    for (const q of questions) {
      const text = answers.get(q.id)?.trim();
      if (text) {
        result.push({ questionId: q.id, value: text, label: text, wasCustom: true });
      }
    }
    onSubmit(question.id, result);
  }, [question.id, questions, answers, onSubmit]);

  return (
    <div className="flex h-full flex-col bg-[var(--bg-base)] p-4">
      {/* Header */}
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Interview</h1>
        <span className="text-xs text-[var(--text-muted)]">
          {answeredCount} of {questions.length} answered
        </span>
      </div>

      {/* All questions, scrollable */}
      <div className="flex-1 space-y-5 overflow-y-auto pr-1">
        {questions.map((q, i) => (
          <QuestionRow
            key={q.id}
            question={q}
            index={i}
            value={answers.get(q.id) ?? ''}
            onChange={(text) => setAnswer(q.id, text)}
            inputRef={i === 0 ? firstRef : undefined}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
        <Button variant="ghost" size="sm" onClick={() => onCancel(question.id)}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={answeredCount === 0}
          className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          Submit {answeredCount > 0 ? `(${answeredCount})` : ''}
        </Button>
      </div>
    </div>
  );
}

// ── Question row ───────────────────────────────────────────────

function QuestionRow({
  question,
  index,
  value,
  onChange,
  inputRef,
}: {
  question: UserFeedbackQuestionItem;
  index: number;
  value: string;
  onChange: (text: string) => void;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? localRef;
  const hasValue = value.trim().length > 0;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
      const el = e.target;
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight, 36)}px`;
    },
    [onChange],
  );

  return (
    <div className="flex gap-3">
      {/* Number badge */}
      <span
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-sm font-medium',
          hasValue
            ? 'bg-emerald-500/15 text-emerald-400'
            : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]',
        )}
      >
        {hasValue ? <Check className="size-3" /> : index + 1}
      </span>

      {/* Question + input */}
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 text-base text-[var(--text-primary)]">{question.prompt}</p>
        <textarea aria-label="Type your answer"
          ref={ref}
          value={value}
          onChange={handleChange}
          placeholder="Type your answer..."
          rows={1}
          className={cn(
            'w-full resize-none rounded-md border px-2.5 py-1.5 text-base',
            'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)]',
            'placeholder:text-[var(--text-muted)]',
            'focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40',
            'transition-colors',
          )}
        />
      </div>
    </div>
  );
}
