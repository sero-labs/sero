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
  canSubmitQuestionnaire,
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

function getActionHint(
  isReview: boolean,
  hasUnresolvedQuestions: boolean,
  allAnswered: boolean,
  currentQuestionAnswered: boolean,
  advanceLabel: string,
): { message: string; positive: boolean } {
  if (isReview) {
    if (hasUnresolvedQuestions) {
      return { message: 'Answer or skip the remaining questions before you submit.', positive: false };
    }
    return allAnswered
      ? { message: 'Everything looks good, submit when ready.', positive: true }
      : { message: 'Review your skipped questions before you submit.', positive: false };
  }

  return currentQuestionAnswered
    ? { message: `${advanceLabel} is ready when you want to continue.`, positive: true }
    : { message: 'Pick an answer, or use Skip if you want to leave this question unanswered.', positive: false };
}

function QuestionnaireStepTabs({
  questions,
  answers,
  currentStep,
  onGoToStep,
}: {
  questions: UserFeedbackQuestionItem[];
  answers: AnswerMap;
  currentStep: number;
  onGoToStep: (step: number) => void;
}) {
  const isReview = currentStep === questions.length;
  const allAnswered = questions.every((item) => hasQuestionAnswerDeep(answers, item));

  return (
    <div className="mt-2 flex items-center gap-1.5">
      {questions.map((item, index) => (
        <button type="button"
          key={item.id}
          onClick={() => onGoToStep(index)}
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
        onClick={() => onGoToStep(questions.length)}
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
  );
}

function QuestionnaireNavigation({
  hint,
  currentStep,
  currentQuestionAnswered,
  isReview,
  advanceLabel,
  onCancel,
  onBack,
  onSkip,
  onNext,
}: {
  hint: { message: string; positive: boolean };
  currentStep: number;
  currentQuestionAnswered: boolean;
  isReview: boolean;
  advanceLabel: string;
  onCancel: () => void;
  onBack: () => void;
  onSkip: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <p
        className={cn(
          'mb-2 min-h-5 text-xs transition-colors',
          hint.positive
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-amber-700 dark:text-amber-300',
        )}
      >
        {hint.message}
      </p>
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex gap-2">
          {currentStep > 0 && (
            <Button variant="secondary" size="sm" onClick={onBack}>
              Back
            </Button>
          )}
          {!isReview && (
            <>
              <Button
                variant={currentQuestionAnswered ? 'ghost' : 'secondary'}
                size="sm"
                onClick={onSkip}
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
                onClick={onNext}
                disabled={!currentQuestionAnswered}
                className={cn(
                  currentQuestionAnswered && 'bg-emerald-600 text-white hover:bg-emerald-700',
                )}
              >
                {advanceLabel}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function QuestionnaireForm({ question, onSubmit, onCancel }: Props) {
  const questions = question.questions;
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>(new Map());
  const [skippedQuestionIds, setSkippedQuestionIds] = useState<ReadonlySet<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const isReview = currentStep === questions.length;
  const allAnswered = questions.every((item) => hasQuestionAnswerDeep(answers, item));
  const hasUnresolvedQuestions = questions.some(
    (item) => !hasQuestionAnswerDeep(answers, item) && !skippedQuestionIds.has(item.id),
  );
  const currentQuestion = questions[currentStep] as UserFeedbackQuestionItem | undefined;
  const currentQuestionAnswered = currentQuestion
    ? hasQuestionAnswerDeep(answers, currentQuestion)
    : false;
  const advanceLabel = currentStep < questions.length - 1 ? 'Next' : 'Review';
  const actionHint = getActionHint(
    isReview,
    hasUnresolvedQuestions,
    allAnswered,
    currentQuestionAnswered,
    advanceLabel,
  );

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

  const clearSkip = useCallback((questionId: string) => {
    setSkippedQuestionIds((previous) => {
      if (!previous.has(questionId)) return previous;
      const next = new Set(previous);
      next.delete(questionId);
      return next;
    });
  }, []);

  const handleSkip = useCallback(() => {
    if (currentQuestion && !currentQuestionAnswered) {
      setAnswers((previous) => clearQuestionTree(previous, currentQuestion));
      setSkippedQuestionIds((previous) => new Set(previous).add(currentQuestion.id));
    }
    goToNextStep();
  }, [clearQuestionTree, currentQuestion, currentQuestionAnswered, goToNextStep]);

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
      if (currentQuestion) {
        clearSkip(currentQuestion.id);
      }

      if (isCurrentQuestion && questionItem.multiSelect !== true && !option.subQuestion) {
        goToNextStep();
      }
    },
    [answers, clearQuestionTree, clearSkip, currentQuestion, goToNextStep],
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
    if (currentQuestion) {
      clearSkip(currentQuestion.id);
    }

    if (currentQuestion?.id === questionItem.id && questionItem.multiSelect !== true) {
      goToNextStep();
    }
  }, [clearQuestionTree, clearSkip, currentQuestion, goToNextStep]);

  const handleRemoveCustom = useCallback((questionItem: UserFeedbackQuestionItem) => {
    setAnswers((previous) => updateQuestionAnswers(
      previous,
      questionItem.id,
      removeCustomQuestionAnswer(getQuestionAnswers(previous, questionItem.id)),
    ));
  }, []);

  const handleSubmit = useCallback(() => {
    if (hasUnresolvedQuestions || !canSubmitQuestionnaire(questions, answers)) return;
    onSubmit(question.id, flattenQuestionnaireAnswers(questions, answers));
  }, [answers, hasUnresolvedQuestions, onSubmit, question.id, questions]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="flex h-full flex-col bg-background p-4 outline-none"
    >
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-foreground">Questionnaire</h1>
        {question.context?.source && (
          <p className="mt-1 text-xs text-muted-foreground">{question.context.source}</p>
        )}
        <QuestionnaireStepTabs
          questions={questions}
          answers={answers}
          currentStep={currentStep}
          onGoToStep={setCurrentStep}
        />
      </div>

      <Card className="flex-1 gap-0 overflow-y-auto p-4 shadow-none">
        {isReview ? (
          <QuestionnaireReviewStep
            questions={questions}
            answers={answers}
            skippedQuestionIds={skippedQuestionIds}
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

      <QuestionnaireNavigation
        hint={actionHint}
        currentStep={currentStep}
        currentQuestionAnswered={currentQuestionAnswered}
        isReview={isReview}
        advanceLabel={advanceLabel}
        onCancel={() => onCancel(question.id)}
        onBack={() => setCurrentStep(currentStep - 1)}
        onSkip={handleSkip}
        onNext={goToNextStep}
      />
    </div>
  );
}
