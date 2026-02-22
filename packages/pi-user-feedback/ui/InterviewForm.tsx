/**
 * InterviewForm — open-ended interview form for the dedicated Sero app UI.
 *
 * Shows all interview questions with text areas (no predefined options).
 * Auto-focuses the first unanswered question. Answers can be edited
 * freely before submitting the batch.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@sero/ui/components/ui/button';
import { Card } from '@sero/ui/components/ui/card';
import { cn } from '@sero/ui/lib/utils';
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
  const textareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());

  // Auto-focus first unanswered question on mount
  useEffect(() => {
    const first = questions.find((q) => !answers.has(q.id));
    if (first) {
      const el = textareaRefs.current.get(first.id);
      el?.focus();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allAnswered = questions.every((q) => {
    const v = answers.get(q.id);
    return v !== undefined && v.trim().length > 0;
  });

  const setAnswer = useCallback((qId: string, text: string) => {
    setAnswers((prev) => new Map(prev).set(qId, text));
  }, []);

  const handleSubmit = useCallback(() => {
    const result: UserFeedbackAnswer[] = [];
    for (const q of questions) {
      const text = answers.get(q.id)?.trim();
      if (text) {
        result.push({
          questionId: q.id,
          value: text,
          label: text,
          wasCustom: true,
        });
      }
    }
    onSubmit(question.id, result);
  }, [question.id, questions, answers, onSubmit]);

  return (
    <div className="flex h-full flex-col bg-background p-4">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-foreground">Interview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Answer each question below. All responses are free-text.
        </p>
        <ProgressDots questions={questions} answers={answers} />
      </div>

      {/* Questions */}
      <Card className="flex-1 gap-0 overflow-y-auto p-4 shadow-none">
        <div className="space-y-6">
          {questions.map((q, i) => (
            <InterviewQuestion
              key={q.id}
              index={i}
              question={q}
              value={answers.get(q.id) ?? ''}
              onChange={(text) => setAnswer(q.id, text)}
              onRef={(el) => {
                if (el) textareaRefs.current.set(q.id, el);
                else textareaRefs.current.delete(q.id);
              }}
            />
          ))}
        </div>
      </Card>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onCancel(question.id)}
        >
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!allAnswered} size="sm">
          Submit All Answers
        </Button>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function ProgressDots({
  questions,
  answers,
}: {
  questions: UserFeedbackQuestionItem[];
  answers: Map<string, string>;
}) {
  return (
    <div className="mt-2 flex items-center gap-1.5">
      {questions.map((q, i) => {
        const hasAnswer = (answers.get(q.id)?.trim().length ?? 0) > 0;
        return (
          <span
            key={q.id}
            className={cn(
              'flex size-6 items-center justify-center rounded-full text-[10px] font-medium transition-colors',
              hasAnswer
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                : 'bg-secondary text-muted-foreground',
            )}
          >
            {hasAnswer ? '✓' : i + 1}
          </span>
        );
      })}
    </div>
  );
}

function InterviewQuestion({
  index,
  question,
  value,
  onChange,
  onRef,
}: {
  index: number;
  question: UserFeedbackQuestionItem;
  value: string;
  onChange: (text: string) => void;
  onRef: (el: HTMLTextAreaElement | null) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea to content
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
      // Auto-grow
      const el = e.target;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    },
    [onChange],
  );

  // Register ref
  useEffect(() => {
    onRef(textareaRef.current);
    return () => onRef(null);
  }, [onRef]);

  return (
    <div>
      <div className="mb-2 flex items-start gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-medium text-muted-foreground">
          {index + 1}
        </span>
        <p className="text-sm font-medium text-foreground">{question.prompt}</p>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        placeholder="Type your answer…"
        rows={2}
        className={cn(
          'ml-7 w-[calc(100%-1.75rem)] resize-none rounded-md border px-3 py-2 text-sm',
          'border-input bg-background text-foreground',
          'placeholder:text-muted-foreground',
          'focus:outline-none focus:ring-1 focus:ring-ring',
          'transition-colors',
        )}
      />
    </div>
  );
}
