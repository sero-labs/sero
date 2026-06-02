import { useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';

import {
  getCustomAnswer,
  getQuestionAnswers,
  type AnswerMap,
} from '../../shared/questionnaire-flow';
import type {
  UserFeedbackQuestionItem,
  UserFeedbackQuestionOption,
} from '../types';

interface QuestionnaireQuestionStepProps {
  question: UserFeedbackQuestionItem;
  answers: AnswerMap;
  onSelectOption: (question: UserFeedbackQuestionItem, option: UserFeedbackQuestionOption, index: number) => void;
  onCustomSubmit: (question: UserFeedbackQuestionItem, text: string) => void;
  onRemoveCustom: (question: UserFeedbackQuestionItem) => void;
}

export function QuestionnaireQuestionStep({
  question,
  answers,
  onSelectOption,
  onCustomSubmit,
  onRemoveCustom,
}: QuestionnaireQuestionStepProps) {
  return (
    <QuestionBlock
      question={question}
      answers={answers}
      onSelectOption={onSelectOption}
      onCustomSubmit={onCustomSubmit}
      onRemoveCustom={onRemoveCustom}
    />
  );
}

function QuestionBlock({
  question,
  answers,
  onSelectOption,
  onCustomSubmit,
  onRemoveCustom,
}: QuestionnaireQuestionStepProps) {
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');
  const questionAnswers = getQuestionAnswers(answers, question.id);
  const customAnswer = getCustomAnswer(questionAnswers);

  const openCustom = () => {
    setCustomMode(true);
    setCustomText(customAnswer?.label ?? '');
  };

  const closeCustom = () => {
    setCustomMode(false);
    setCustomText('');
  };

  const submitCustom = () => {
    const trimmed = customText.trim();
    if (!trimmed) return;
    onCustomSubmit(question, trimmed);
    closeCustom();
  };

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-foreground">{question.prompt}</p>
      {question.multiSelect && (
        <p className="mb-4 text-xs text-muted-foreground">
          Select one or more options, then continue.
        </p>
      )}
      <div className="space-y-1.5">
        {question.options.map((option, index) => {
          const isSelected = questionAnswers.some(
            (answer) => !answer.wasCustom && answer.value === option.value,
          );
          const subQuestion = isSelected ? option.subQuestion : undefined;
          return (
            <div key={option.value} className="space-y-1.5">
              <button type="button"
                onClick={() => onSelectOption(question, option, index)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors duration-200 active:scale-[0.99]',
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
                  {question.multiSelect ? (isSelected ? <Check className="size-3" /> : null) : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-foreground">{option.label}</span>
                  {option.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {option.description}
                    </p>
                  )}
                </div>
              </button>

              {subQuestion && (
                <div className="ml-8 border-l border-emerald-500/25 pl-4 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-3">
                    <QuestionBlock
                      question={subQuestion}
                      answers={answers}
                      onSelectOption={onSelectOption}
                      onCustomSubmit={onCustomSubmit}
                      onRemoveCustom={onRemoveCustom}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {customAnswer && !customMode && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Custom answer
                </p>
                <p className="mt-0.5 text-sm text-foreground">{customAnswer.label}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={openCustom}>
                  Edit
                </Button>
                {question.multiSelect && (
                  <Button size="sm" variant="ghost" onClick={() => onRemoveCustom(question)}>
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {question.allowOther && !customMode && !customAnswer && (
          <button type="button"
            onClick={openCustom}
            className="flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2.5 text-left hover:border-border hover:bg-secondary"
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[10px] text-muted-foreground">
              <Pencil className="size-3" />
            </span>
            <span className="text-sm text-muted-foreground">Type something…</span>
          </button>
        )}

        {customMode && (
          <div className="flex gap-2 pt-2">
            <input aria-label="Other answer"
              type="text"
              value={customText}
              onChange={(event) => setCustomText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitCustom();
                if (event.key === 'Escape') closeCustom();
              }}
              placeholder="Type your answer…"
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Button size="sm" onClick={submitCustom} disabled={!customText.trim()}>
              Submit
            </Button>
            <Button size="sm" variant="ghost" onClick={closeCustom}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
