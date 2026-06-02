/**
 * QuestionnaireForm, multi-step questionnaire form for the dedicated app UI.
 *
 * Shows questions as steps with option selection, custom text input,
 * review summary, and submit/cancel actions.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card } from '@sero-ai/ui/components/ui/card';
import { cn } from '@sero-ai/ui/lib/utils';

import {
  flattenQuestionnaireAnswers,
  getQuestionAnswers,
  hasQuestionAnswerDeep,
  removeCustomQuestionAnswer,
  selectQuestionOption,
  submitCustomQuestionAnswer,
  updateQuestionAnswers,
  type AnswerMap,
} from '../shared/questionnaire-flow';
import type {
  UserFeedbackAnswer,
  UserFeedbackPendingQuestion,
  UserFeedbackQuestionItem,
  UserFeedbackQuestionOption,
} from './types';
import { QuestionnaireQuestionStep } from './questionnaire/QuestionnaireQuestionStep';
import { QuestionnaireReviewStep } from './questionnaire/QuestionnaireReviewStep';

interface Props {
  question: UserFeedbackPendingQuestion;
  onSubmit: (id: string, answers: UserFeedbackAnswer[]) => void;
  onCancel: (id: string) => void;
}

export function QuestionnaireForm({ question, onSubmit, onCancel }: Props) {
  const questions = question.questions;
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const isReview = currentStep === questions.length;
  const allAnswered = questions.every((item) => hasQuestionAnswerDeep(answers, item));
  const currentQuestion = questions[currentStep] as UserFeedbackQuestionItem | undefined;
  const currentQuestionAnswered = currentQuestion
    ? hasQuestionAnswerDeep(answers, currentQuestion)
    : false;
  const advanceLabel = currentStep < questions.length - 1 ? 'Next' : 'Review';
  const actionHint = isReview
    ? allAnswered
      ? 'Everything looks good, submit when ready.'
      : 'Some questions are still skipped, edit anything in amber or submit your partial answers.'
    : currentQuestionAnswered
      ? `${advanceLabel} is ready when you want to continue.`
      : 'Pick an answer, or use Skip if you want to leave this question unanswered.';

  const clearQuestionTree = useCallback((next: AnswerMap, questionItem: UserFeedbackQuestionItem): AnswerMap => {
    const cleaned = new Map(next);
    cleaned.delete(questionItem.id);
    for (const option of questionItem.options) {
      if (option.subQuestion) clearQuestionTree(cleaned, option.subQuestion);
    }
    return cleaned;
  }, []);

  const goToNextStep = useCallback(() => {
    setCurrentStep((previous) => previous + 1);
  }, []);

  const handleSelectOption = useCallback(
    (questionItem: UserFeedbackQuestionItem, option: UserFeedbackQuestionOption, index: number) => {
      const isCurrentQuestion = currentQuestion?.id === questionItem.id;
      const currentQuestionAnswers = getQuestionAnswers(answers, questionItem.id);

      const nextAnswers = selectQuestionOption(
        questionItem,
        option,
        index,
        currentQuestionAnswers,
      );
      const selectedSubQuestionIds = new Set(
        nextAnswers
          .map((answer) => questionItem.options.find((item) => item.value === answer.value)?.subQuestion?.id)
          .filter(Boolean),
      );

      setAnswers((previous) => {
        const next = updateQuestionAnswers(previous, questionItem.id, nextAnswers);
        let cleaned = next;
        for (const optionItem of questionItem.options) {
          const subQuestion = optionItem.subQuestion;
          if (subQuestion && !selectedSubQuestionIds.has(subQuestion.id)) {
            cleaned = clearQuestionTree(cleaned, subQuestion);
          }
        }
        return cleaned;
      });

      if (isCurrentQuestion && questionItem.multiSelect !== true && !option.subQuestion) {
        goToNextStep();
      }
    },
    [answers, clearQuestionTree, currentQuestion?.id, goToNextStep],
  );

  const handleCustomSubmit = useCallback((questionItem: UserFeedbackQuestionItem, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setAnswers((previous) => {
      const currentQuestionAnswers = getQuestionAnswers(previous, questionItem.id);
      const nextAnswers = submitCustomQuestionAnswer(questionItem, currentQuestionAnswers, trimmed);
      let next = updateQuestionAnswers(previous, questionItem.id, nextAnswers);
      for (const option of questionItem.options) {
        if (option.subQuestion) next = clearQuestionTree(next, option.subQuestion);
      }
      return next;
    });

    if (currentQuestion?.id === questionItem.id && questionItem.multiSelect !== true) {
      goToNextStep();
    }
  }, [clearQuestionTree, currentQuestion?.id, goToNextStep]);

  const handleRemoveCustom = useCallback((questionItem: UserFeedbackQuestionItem) => {
    setAnswers((previous) => updateQuestionAnswers(
      previous,
      questionItem.id,
      removeCustomQuestionAnswer(getQuestionAnswers(previous, questionItem.id)),
    ));
  }, []);

  const handleSubmit = useCallback(() => {
    onSubmit(question.id, flattenQuestionnaireAnswers(questions, answers));
  }, [answers, onSubmit, question.id, questions]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="flex h-full flex-col bg-background p-4 outline-none"
    >
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-foreground">Questionnaire</h1>
        <div className="mt-2 flex items-center gap-1.5">
          {questions.map((item, index) => (
            <button type="button"
              key={item.id}
              onClick={() => setCurrentStep(index)}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                index === currentStep && !isReview
                  ? hasQuestionAnswerDeep(answers, item)
                    ? 'bg-emerald-500 text-white'
                    : 'bg-amber-500 text-white'
                  : hasQuestionAnswerDeep(answers, item)
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : 'bg-secondary text-muted-foreground',
              )}
            >
              {hasQuestionAnswerDeep(answers, item) ? <Check className="size-3" /> : index + 1} {item.label}
            </button>
          ))}
          <button type="button"
            onClick={() => setCurrentStep(questions.length)}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
              isReview
                ? allAnswered
                  ? 'bg-emerald-500 text-white'
                  : 'bg-amber-500 text-white'
                : allAnswered
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                  : 'bg-secondary text-muted-foreground',
            )}
          >
            Review
          </button>
        </div>
      </div>

      <Card className="flex-1 gap-0 overflow-y-auto p-4 shadow-none">
        {isReview ? (
          <QuestionnaireReviewStep
            questions={questions}
            answers={answers}
            onSubmit={handleSubmit}
            onGoToStep={setCurrentStep}
          />
        ) : currentQuestion ? (
          <QuestionnaireQuestionStep
            question={currentQuestion}
            answers={answers}
            onSelectOption={handleSelectOption}
            onCustomSubmit={handleCustomSubmit}
            onRemoveCustom={handleRemoveCustom}
          />
        ) : null}
      </Card>

      <div className="mt-3 border-t border-border/60 pt-3">
        <p
          className={cn(
            'mb-2 min-h-5 text-xs transition-colors',
            isReview
              ? allAnswered
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-amber-700 dark:text-amber-300'
              : currentQuestionAnswered
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-amber-700 dark:text-amber-300',
          )}
        >
          {actionHint}
        </p>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => onCancel(question.id)}>
            Cancel
          </Button>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentStep(currentStep - 1)}
              >
                Back
              </Button>
            )}
            {!isReview && (
              <>
                <Button
                  variant={currentQuestionAnswered ? 'ghost' : 'secondary'}
                  size="sm"
                  onClick={() => setCurrentStep(currentStep + 1)}
                  className={cn(
                    !currentQuestionAnswered &&
                      'border border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 hover:text-amber-800 dark:text-amber-300 dark:hover:bg-amber-500/15',
                  )}
                >
                  Skip
                </Button>
                <Button
                  variant={currentQuestionAnswered ? 'default' : 'secondary'}
                  size="sm"
                  onClick={goToNextStep}
                  disabled={!currentQuestionAnswered}
                  className={cn(
                    currentQuestionAnswered &&
                      'bg-emerald-600 text-white hover:bg-emerald-700',
                  )}
                >
                  {advanceLabel}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
