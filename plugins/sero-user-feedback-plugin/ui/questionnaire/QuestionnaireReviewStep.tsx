import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';

import {
  canSubmitQuestionnaire,
  flattenQuestionnaireAnswers,
  formatQuestionnaireAnswerLabel,
  hasQuestionAnswerDeep,
} from '../../shared/questionnaire-flow';
import type {
  UserFeedbackAnswer,
  UserFeedbackQuestionItem,
} from '../types';

interface QuestionnaireReviewStepProps {
  questions: UserFeedbackQuestionItem[];
  answers: ReadonlyMap<string, UserFeedbackAnswer[]>;
  onSubmit: () => void;
  onGoToStep: (index: number) => void;
}

export function QuestionnaireReviewStep({
  questions,
  answers,
  onSubmit,
  onGoToStep,
}: QuestionnaireReviewStepProps) {
  const skippedCount = questions.filter((question) => !hasQuestionAnswerDeep(answers, question)).length;

  return (
    <div>
      <p className="mb-1 text-base font-medium text-foreground">Review your answers</p>
      <p
        className={cn(
          'mb-4 text-xs',
          skippedCount > 0
            ? 'text-amber-700 dark:text-amber-300'
            : 'text-emerald-700 dark:text-emerald-400',
        )}
      >
        {skippedCount > 0
          ? `${skippedCount} ${skippedCount === 1 ? 'question is' : 'questions are'} still skipped, edit anything in amber or submit when ready.`
          : 'Everything is answered, submit when ready.'}
      </p>
      <div className="space-y-3">
        {questions.map((question, index) => {
          const questionAnswers = flattenQuestionnaireAnswers([question], answers);
          const isSkipped = !hasQuestionAnswerDeep(answers, question);
          return (
            <div
              key={question.id}
              className={cn(
                'rounded-md border p-3',
                isSkipped ? 'border-amber-500/25 bg-amber-500/5' : 'border-border',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {question.label}
                  </p>
                  <p className="mt-0.5 text-base text-foreground">{question.prompt}</p>
                </div>
                <button type="button"
                  onClick={() => onGoToStep(index)}
                  className={cn(
                    'shrink-0 text-xs hover:underline',
                    isSkipped
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-emerald-400',
                  )}
                >
                  Edit
                </button>
              </div>
              {questionAnswers.length > 0 ? (
                <div className="mt-2 space-y-1 text-base text-emerald-700 dark:text-emerald-400">
                  {questionAnswers.map((answer, answerIndex) => (
                    <p key={`${question.id}-${answer.value}-${answerIndex}`}>
                      {formatQuestionnaireAnswerLabel(answer)}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Skipped</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          onClick={onSubmit}
          disabled={!canSubmitQuestionnaire(questions, answers)}
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Submit All Answers
        </Button>
      </div>
    </div>
  );
}
