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
  UserFeedbackQuestionOption,
} from './types';

interface Props {
  question: UserFeedbackPendingQuestion;
  onSubmit: (id: string, answers: UserFeedbackAnswer[]) => void;
  onCancel: (id: string) => void;
}

type AnswerMap = Map<string, UserFeedbackAnswer[]>;

export function QuestionnaireForm({ question, onSubmit, onCancel }: Props) {
  const questions = question.questions;
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>(new Map());
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { containerRef.current?.focus(); }, []);

  const isReview = currentStep === questions.length;
  const allAnswered = questions.every((q) => hasQuestionAnswer(answers, q.id));
  const currentQ = questions[currentStep] as UserFeedbackQuestionItem | undefined;
  const currentAnswers = currentQ ? getQuestionAnswers(answers, currentQ.id) : [];

  const saveQuestionAnswers = useCallback((qId: string, nextAnswers: UserFeedbackAnswer[]) => {
    setAnswers((prev) => {
      const next = new Map(prev);
      if (nextAnswers.length === 0) {
        next.delete(qId);
      } else {
        next.set(qId, nextAnswers);
      }
      return next;
    });
  }, []);

  const goToNextStep = useCallback(() => {
    setCurrentStep((prev) => prev + 1);
    setCustomMode(false);
    setCustomText('');
  }, []);

  const handleSelectOption = useCallback(
    (opt: UserFeedbackQuestionOption, index: number) => {
      if (!currentQ) return;

      const nextAnswer: UserFeedbackAnswer = {
        questionId: currentQ.id,
        value: opt.value,
        label: opt.label,
        wasCustom: false,
        index: index + 1,
      };

      if (currentQ.multiSelect !== true) {
        saveQuestionAnswers(currentQ.id, [nextAnswer]);
        goToNextStep();
        return;
      }

      const isSelected = currentAnswers.some(
        (answer) => !answer.wasCustom && answer.value === opt.value,
      );

      if (isSelected) {
        saveQuestionAnswers(
          currentQ.id,
          currentAnswers.filter((answer) => answer.wasCustom || answer.value !== opt.value),
        );
        return;
      }

      if (opt.exclusive) {
        saveQuestionAnswers(currentQ.id, [nextAnswer]);
        return;
      }

      const nextAnswers = currentAnswers.filter((answer) => {
        if (answer.wasCustom) return true;
        return !getOptionByValue(currentQ, answer.value)?.exclusive;
      });
      nextAnswers.push(nextAnswer);
      saveQuestionAnswers(currentQ.id, nextAnswers);
    },
    [currentAnswers, currentQ, goToNextStep, saveQuestionAnswers],
  );

  const handleCustomSubmit = useCallback(() => {
    if (!currentQ) return;
    const text = customText.trim();
    if (!text) return;

    const customAnswer: UserFeedbackAnswer = {
      questionId: currentQ.id,
      value: text,
      label: text,
      wasCustom: true,
    };

    if (currentQ.multiSelect !== true) {
      saveQuestionAnswers(currentQ.id, [customAnswer]);
      goToNextStep();
      return;
    }

    const nextAnswers = currentAnswers.filter((answer) => {
      if (answer.wasCustom) return false;
      return !getOptionByValue(currentQ, answer.value)?.exclusive;
    });
    nextAnswers.push(customAnswer);
    saveQuestionAnswers(currentQ.id, nextAnswers);
    setCustomMode(false);
    setCustomText('');
  }, [currentAnswers, currentQ, customText, goToNextStep, saveQuestionAnswers]);

  const handleSubmit = useCallback(() => {
    onSubmit(
      question.id,
      questions.flatMap((q) => getQuestionAnswers(answers, q.id)),
    );
  }, [question.id, questions, answers, onSubmit]);

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
              onClick={() => {
                setCurrentStep(i);
                setCustomMode(false);
                setCustomText('');
              }}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                i === currentStep && !isReview
                  ? 'bg-emerald-500 text-white'
                  : hasQuestionAnswer(answers, q.id)
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : 'bg-secondary text-muted-foreground',
              )}
            >
              {hasQuestionAnswer(answers, q.id) ? '✓' : i + 1} {q.label}
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
            onSubmit={handleSubmit}
            onGoToStep={(i) => setCurrentStep(i)}
          />
        ) : currentQ ? (
          <QuestionStep
            question={currentQ}
            answers={currentAnswers}
            customMode={customMode}
            customText={customText}
            onSelectOption={handleSelectOption}
            onEnableCustom={() => {
              setCustomMode(true);
              setCustomText(getCustomAnswer(currentAnswers)?.label ?? '');
            }}
            onRemoveCustom={() => {
              saveQuestionAnswers(
                currentQ.id,
                currentAnswers.filter((answer) => !answer.wasCustom),
              );
              setCustomMode(false);
              setCustomText('');
            }}
            onCustomTextChange={setCustomText}
            onCustomSubmit={handleCustomSubmit}
            onCancelCustom={() => {
              setCustomMode(false);
              setCustomText('');
            }}
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
              onClick={() => {
                setCurrentStep(currentStep - 1);
                setCustomMode(false);
                setCustomText('');
              }}
            >
              Back
            </Button>
          )}
          {!isReview && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCurrentStep(currentStep + 1);
                  setCustomMode(false);
                  setCustomText('');
                }}
              >
                Skip
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={goToNextStep}
                disabled={!currentQ || !hasQuestionAnswer(answers, currentQ.id)}
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
  answers,
  customMode,
  customText,
  onSelectOption,
  onEnableCustom,
  onRemoveCustom,
  onCustomTextChange,
  onCustomSubmit,
  onCancelCustom,
}: {
  question: UserFeedbackQuestionItem;
  answers: UserFeedbackAnswer[];
  customMode: boolean;
  customText: string;
  onSelectOption: (opt: UserFeedbackQuestionOption, index: number) => void;
  onEnableCustom: () => void;
  onRemoveCustom: () => void;
  onCustomTextChange: (text: string) => void;
  onCustomSubmit: () => void;
  onCancelCustom: () => void;
}) {
  const customAnswer = getCustomAnswer(answers);

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-foreground">{question.prompt}</p>
      {question.multiSelect && (
        <p className="mb-4 text-xs text-muted-foreground">
          Select one or more options, then continue.
        </p>
      )}
      <div className="space-y-1.5">
        {question.options.map((opt, i) => {
          const isSelected = answers.some((answer) => !answer.wasCustom && answer.value === opt.value);
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
              <span
                className={cn(
                  'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium',
                  question.multiSelect && 'rounded-[4px]',
                  isSelected
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-[var(--border)] text-muted-foreground',
                )}
              >
                {question.multiSelect ? (isSelected ? '✓' : '') : i + 1}
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

        {customAnswer && !customMode && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Custom answer</p>
                <p className="mt-0.5 text-sm text-foreground">{customAnswer.label}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={onEnableCustom}>Edit</Button>
                {question.multiSelect && (
                  <Button size="sm" variant="ghost" onClick={onRemoveCustom}>Clear</Button>
                )}
              </div>
            </div>
          </div>
        )}

        {question.allowOther && !customMode && !customAnswer && (
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
  onSubmit,
  onGoToStep,
}: {
  questions: UserFeedbackQuestionItem[];
  answers: AnswerMap;
  onSubmit: () => void;
  onGoToStep: (index: number) => void;
}) {
  return (
    <div>
      <p className="mb-4 text-sm font-medium text-foreground">Review your answers</p>
      <div className="space-y-3">
        {questions.map((q, i) => {
          const questionAnswers = getQuestionAnswers(answers, q.id);
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
              {questionAnswers.length > 0 ? (
                <div className="mt-2 space-y-1 text-sm text-emerald-700 dark:text-emerald-400">
                  {questionAnswers.map((answer, answerIndex) => (
                    <p key={`${q.id}-${answer.value}-${answerIndex}`}>
                      {formatAnswerLabel(answer)}
                    </p>
                  ))}
                </div>
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

function getQuestionAnswers(answers: AnswerMap, qId: string): UserFeedbackAnswer[] {
  return answers.get(qId) ?? [];
}

function hasQuestionAnswer(answers: AnswerMap, qId: string): boolean {
  return getQuestionAnswers(answers, qId).length > 0;
}

function getCustomAnswer(answers: UserFeedbackAnswer[]): UserFeedbackAnswer | undefined {
  return answers.find((answer) => answer.wasCustom);
}

function getOptionByValue(
  question: UserFeedbackQuestionItem,
  value: string,
): UserFeedbackQuestionOption | undefined {
  return question.options.find((opt) => opt.value === value);
}

function formatAnswerLabel(answer: UserFeedbackAnswer): string {
  return answer.wasCustom ? `✎ ${answer.label}` : `${answer.index}. ${answer.label}`;
}
