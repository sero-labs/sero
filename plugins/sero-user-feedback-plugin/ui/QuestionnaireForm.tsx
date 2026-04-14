/**
 * QuestionnaireForm — multi-step questionnaire form for the dedicated app UI.
 *
 * Shows questions as steps with option selection, custom text input,
 * review summary, and submit/cancel actions.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card } from '@sero-ai/ui/components/ui/card';
import { cn } from '@sero-ai/ui/lib/utils';

import {
  flattenQuestionnaireAnswers,
  getQuestionAnswers,
  hasQuestionAnswer,
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
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const isReview = currentStep === questions.length;
  const allAnswered = questions.every((item) => hasQuestionAnswer(answers, item.id));
  const currentQuestion = questions[currentStep] as UserFeedbackQuestionItem | undefined;
  const currentAnswers = currentQuestion
    ? getQuestionAnswers(answers, currentQuestion.id)
    : [];

  const resetCustomInput = useCallback(() => {
    setCustomMode(false);
    setCustomText('');
  }, []);

  const saveQuestionAnswers = useCallback((questionId: string, nextAnswers: UserFeedbackAnswer[]) => {
    setAnswers((previous) => updateQuestionAnswers(previous, questionId, nextAnswers));
  }, []);

  const goToNextStep = useCallback(() => {
    setCurrentStep((previous) => previous + 1);
    resetCustomInput();
  }, [resetCustomInput]);

  const handleSelectOption = useCallback(
    (option: UserFeedbackQuestionOption, index: number) => {
      if (!currentQuestion) return;

      const nextAnswers = selectQuestionOption(
        currentQuestion,
        option,
        index,
        currentAnswers,
      );
      saveQuestionAnswers(currentQuestion.id, nextAnswers);
      if (currentQuestion.multiSelect !== true) {
        goToNextStep();
      }
    },
    [currentAnswers, currentQuestion, goToNextStep, saveQuestionAnswers],
  );

  const handleCustomSubmit = useCallback(() => {
    if (!currentQuestion) return;
    const text = customText.trim();
    if (!text) return;

    const nextAnswers = submitCustomQuestionAnswer(
      currentQuestion,
      currentAnswers,
      text,
    );
    saveQuestionAnswers(currentQuestion.id, nextAnswers);

    if (currentQuestion.multiSelect !== true) {
      goToNextStep();
      return;
    }

    resetCustomInput();
  }, [currentAnswers, currentQuestion, customText, goToNextStep, resetCustomInput, saveQuestionAnswers]);

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
            <button
              key={item.id}
              onClick={() => {
                setCurrentStep(index);
                resetCustomInput();
              }}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                index === currentStep && !isReview
                  ? 'bg-emerald-500 text-white'
                  : hasQuestionAnswer(answers, item.id)
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : 'bg-secondary text-muted-foreground',
              )}
            >
              {hasQuestionAnswer(answers, item.id) ? '✓' : index + 1} {item.label}
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
            answers={currentAnswers}
            customMode={customMode}
            customText={customText}
            onSelectOption={handleSelectOption}
            onEnableCustom={() => {
              setCustomMode(true);
              setCustomText(
                currentAnswers.find((answer) => answer.wasCustom)?.label ?? '',
              );
            }}
            onRemoveCustom={() => {
              saveQuestionAnswers(
                currentQuestion.id,
                removeCustomQuestionAnswer(currentAnswers),
              );
              resetCustomInput();
            }}
            onCustomTextChange={setCustomText}
            onCustomSubmit={handleCustomSubmit}
            onCancelCustom={resetCustomInput}
          />
        ) : null}
      </Card>

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
                resetCustomInput();
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
                  resetCustomInput();
                }}
              >
                Skip
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={goToNextStep}
                disabled={!currentQuestion || !hasQuestionAnswer(answers, currentQuestion.id)}
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
