import { Button } from '@sero-ai/ui/components/ui/button';

import {
  canSubmitQuestionnaire,
  formatQuestionnaireAnswerLabel,
  getQuestionAnswers,
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
  return (
    <div>
      <p className="mb-4 text-sm font-medium text-foreground">Review your answers</p>
      <div className="space-y-3">
        {questions.map((question, index) => {
          const questionAnswers = getQuestionAnswers(answers, question.id);
          return (
            <div key={question.id} className="rounded-md border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {question.label}
                  </p>
                  <p className="mt-0.5 text-sm text-foreground">{question.prompt}</p>
                </div>
                <button
                  onClick={() => onGoToStep(index)}
                  className="shrink-0 text-xs text-emerald-400 hover:underline"
                >
                  Edit
                </button>
              </div>
              {questionAnswers.length > 0 ? (
                <div className="mt-2 space-y-1 text-sm text-emerald-700 dark:text-emerald-400">
                  {questionAnswers.map((answer, answerIndex) => (
                    <p key={`${question.id}-${answer.value}-${answerIndex}`}>
                      {formatQuestionnaireAnswerLabel(answer)}
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
        <Button onClick={onSubmit} disabled={!canSubmitQuestionnaire(questions, answers)}>
          Submit All Answers
        </Button>
      </div>
    </div>
  );
}
