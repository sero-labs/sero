/**
 * QuestionnaireForm — multi-step questionnaire form for the dedicated app UI.
 *
 * Shows questions as steps with option selection, custom text input,
 * review summary, and submit/cancel actions.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card } from '@sero-ai/ui/components/ui/card';
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

export function QuestionnaireForm({ question, onSubmit, onCancel }: Props) {
  const questions = question.questions;
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Map<string, UserFeedbackAnswer>>(new Map());
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { containerRef.current?.focus(); }, []);

  const isReview = currentStep === questions.length;
  const allAnswered = questions.every((q) => answers.has(q.id));
  const currentQ = questions[currentStep] as UserFeedbackQuestionItem | undefined;

  const saveAnswer = useCallback((qId: string, ans: UserFeedbackAnswer) => {
    setAnswers((prev) => new Map(prev).set(qId, ans));
  }, []);

  const handleSelectOption = useCallback(
    (opt: { value: string; label: string }, index: number) => {
      if (!currentQ) return;
      saveAnswer(currentQ.id, {
        questionId: currentQ.id,
        value: opt.value,
        label: opt.label,
        wasCustom: false,
        index: index + 1,
      });
      setCustomMode(false);
      setCustomText('');
      // Auto-advance to next question (or to review after the last question)
      setCurrentStep(currentStep + 1);
    },
    [currentQ, currentStep, saveAnswer],
  );

  const handleCustomSubmit = useCallback(() => {
    if (!currentQ) return;
    const text = customText.trim();
    if (!text) return;
    saveAnswer(currentQ.id, {
      questionId: currentQ.id,
      value: text,
      label: text,
      wasCustom: true,
    });
    setCustomMode(false);
    setCustomText('');
    // Auto-advance to next question (or to review after the last question)
    setCurrentStep(currentStep + 1);
  }, [currentQ, customText, currentStep, saveAnswer]);

  const handleSubmit = useCallback(() => {
    onSubmit(question.id, Array.from(answers.values()));
  }, [question.id, answers, onSubmit]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="flex h-full flex-col bg-background p-4 outline-none"
    >
      {/* Step indicator */}
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-foreground">Questionnaire</h1>
        <div className="mt-2 flex items-center gap-1.5">
          {questions.map((q, i) => (
            <button
              key={q.id}
              onClick={() => { setCurrentStep(i); setCustomMode(false); setCustomText(''); }}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                i === currentStep && !isReview
                  ? 'bg-emerald-500 text-white'
                  : answers.has(q.id)
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : 'bg-secondary text-muted-foreground',
              )}
            >
              {answers.has(q.id) ? '✓' : i + 1} {q.label}
            </button>
          ))}
          <button
            onClick={() => setCurrentStep(questions.length)}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
              isReview
                ? 'bg-emerald-500 text-white'
                : allAnswered
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                  : 'bg-secondary text-muted-foreground',
            )}
          >
            Review
          </button>
        </div>
      </div>

      {/* Content area */}
      <Card className="flex-1 gap-0 overflow-y-auto p-4 shadow-none">
        {isReview ? (
          <ReviewStep
            questions={questions}
            answers={answers}
            allAnswered={allAnswered}
            onSubmit={handleSubmit}
            onGoToStep={(i) => setCurrentStep(i)}
          />
        ) : currentQ ? (
          <QuestionStep
            question={currentQ}
            answer={answers.get(currentQ.id)}
            customMode={customMode}
            customText={customText}
            onSelectOption={handleSelectOption}
            onEnableCustom={() => setCustomMode(true)}
            onCustomTextChange={setCustomText}
            onCustomSubmit={handleCustomSubmit}
            onCancelCustom={() => { setCustomMode(false); setCustomText(''); }}
          />
        ) : null}
      </Card>

      {/* Footer actions */}
      <div className="mt-3 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => onCancel(question.id)}>
          Cancel
        </Button>
        <div className="flex gap-2">
          {currentStep > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setCurrentStep(currentStep - 1); setCustomMode(false); }}
            >
              Back
            </Button>
          )}
          {!isReview && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setCurrentStep(currentStep + 1); setCustomMode(false); setCustomText(''); }}
              >
                Skip
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setCurrentStep(currentStep + 1); setCustomMode(false); setCustomText(''); }}
                disabled={!currentQ || !answers.has(currentQ.id)}
              >
                {currentStep < questions.length - 1 ? 'Next' : 'Review'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function QuestionStep({
  question,
  answer,
  customMode,
  customText,
  onSelectOption,
  onEnableCustom,
  onCustomTextChange,
  onCustomSubmit,
  onCancelCustom,
}: {
  question: UserFeedbackQuestionItem;
  answer: UserFeedbackAnswer | undefined;
  customMode: boolean;
  customText: string;
  onSelectOption: (opt: { value: string; label: string }, index: number) => void;
  onEnableCustom: () => void;
  onCustomTextChange: (text: string) => void;
  onCustomSubmit: () => void;
  onCancelCustom: () => void;
}) {
  return (
    <div>
      <p className="mb-4 text-sm font-medium text-foreground">{question.prompt}</p>
      <div className="space-y-1.5">
        {question.options.map((opt, i) => {
          const isSelected = answer && !answer.wasCustom && answer.value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onSelectOption(opt, i)}
              className={cn(
                'flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors',
                isSelected
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-transparent hover:border-border hover:bg-secondary',
              )}
            >
              <span className={cn(
                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium',
                isSelected ? 'border-emerald-500 text-emerald-400' : 'border-[var(--border)] text-muted-foreground',
              )}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-sm text-foreground">{opt.label}</span>
                {opt.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{opt.description}</p>
                )}
              </div>
            </button>
          );
        })}

        {question.allowOther && !customMode && (
          <button
            onClick={onEnableCustom}
            className="flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2.5 text-left hover:border-border hover:bg-secondary"
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[10px] text-muted-foreground">✎</span>
            <span className="text-sm text-muted-foreground">Type something…</span>
          </button>
        )}

        {customMode && (
          <div className="flex gap-2 pt-2">
            <input
              autoFocus
              type="text"
              value={customText}
              onChange={(e) => onCustomTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCustomSubmit();
                if (e.key === 'Escape') onCancelCustom();
              }}
              placeholder="Type your answer…"
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Button size="sm" onClick={onCustomSubmit} disabled={!customText.trim()}>Submit</Button>
            <Button size="sm" variant="ghost" onClick={onCancelCustom}>Cancel</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewStep({
  questions,
  answers,
  allAnswered,
  onSubmit,
  onGoToStep,
}: {
  questions: UserFeedbackQuestionItem[];
  answers: Map<string, UserFeedbackAnswer>;
  allAnswered: boolean;
  onSubmit: () => void;
  onGoToStep: (index: number) => void;
}) {
  return (
    <div>
      <p className="mb-4 text-sm font-medium text-foreground">Review your answers</p>
      <div className="space-y-3">
        {questions.map((q, i) => {
          const answer = answers.get(q.id);
          return (
            <div key={q.id} className="rounded-md border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">{q.label}</p>
                  <p className="mt-0.5 text-sm text-foreground">{q.prompt}</p>
                </div>
                <button
                  onClick={() => onGoToStep(i)}
                  className="shrink-0 text-xs text-emerald-400 hover:underline"
                >
                  Edit
                </button>
              </div>
              {answer ? (
                <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
                  {answer.wasCustom ? `✎ ${answer.label}` : `${answer.index}. ${answer.label}`}
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Skipped</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={onSubmit} disabled={answers.size === 0}>
          Submit All Answers
        </Button>
      </div>
    </div>
  );
}
