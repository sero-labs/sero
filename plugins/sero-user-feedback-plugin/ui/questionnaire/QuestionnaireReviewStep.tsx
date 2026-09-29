import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';

import {
  canSubmitQuestionnaire,
  flattenQuestionnaireAnswers,
  formatQuestionnaireAnswerLabel,
  type QuestionStatus,
} from '../../shared/questionnaire-flow';
import type {
  UserFeedbackAnswer,
  UserFeedbackQuestionItem,
} from '../types';

interface QuestionnaireReviewStepProps {
  questions: UserFeedbackQuestionItem[];
  answers: ReadonlyMap<string, UserFeedbackAnswer[]>;
  statuses: ReadonlyMap<string, QuestionStatus>;
  onSubmit: () => void;
  onGoToStep: (index: number) => void;
}

export function QuestionnaireReviewStep({
  questions,
  answers,
  statuses,
  onSubmit,
  onGoToStep,
}: QuestionnaireReviewStepProps) {
  const statusList = questions.map((question) => statuses.get(question.id));
  const skippedCount = statusList.filter((status) => status === 'skipped').length;
  const unresolvedCount = statusList.filter((status) => status === 'unresolved').length;

  return (
    <div>
      <p className="mb-1 text-base font-medium text-foreground">Review your answers</p>
      <p
        className={cn(
          'mb-4 text-xs',
          skippedCount > 0 || unresolvedCount > 0
            ? 'text-amber-700 dark:text-amber-300'
            : 'text-emerald-700 dark:text-emerald-400',
        )}
      >
        {unresolvedCount > 0
          ? `${unresolvedCount} ${unresolvedCount === 1 ? 'question needs' : 'questions need'} an answer or Skip before you submit.`
          : skippedCount > 0
            ? `${skippedCount} ${skippedCount === 1 ? 'question was' : 'questions were'} skipped. Submit when ready.`
            : 'Everything is answered, submit when ready.'}
      </p>
      <div className="space-y-3">
        {questions.map((question, index) => {
          const questionStatus = statuses.get(question.id);
          const questionAnswers = flattenQuestionnaireAnswers([question], answers);
          const isUnanswered = questionStatus !== 'answered';
          return (
            <div
              key={question.id}
              className={cn(
                'rounded-md border p-3',
                isUnanswered ? 'border-amber-500/25 bg-amber-500/5' : 'border-border',
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
                    isUnanswered
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-emerald-400',
                  )}
                >
                  Edit
                </button>
              </div>
              {questionAnswers.length > 0 && (
                <div className="mt-2 space-y-1 text-base text-emerald-700 dark:text-emerald-400">
                  {questionAnswers.map((answer, answerIndex) => (
                    <p key={`${question.id}-${answer.value}-${answerIndex}`}>
                      {formatQuestionnaireAnswerLabel(answer)}
                    </p>
                  ))}
                </div>
              )}
              {isUnanswered && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  {questionStatus === 'skipped' ? 'Skipped' : 'Needs an answer or Skip'}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          onClick={onSubmit}
          disabled={unresolvedCount > 0 || !canSubmitQuestionnaire(questions, answers)}
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Submit All Answers
        </Button>
      </div>
    </div>
  );
}
