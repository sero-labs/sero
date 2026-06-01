import { Check, Pencil } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';

import {
  getCustomAnswer,
} from '../../shared/questionnaire-flow';
import type {
  UserFeedbackAnswer,
  UserFeedbackQuestionItem,
  UserFeedbackQuestionOption,
} from '../types';

interface QuestionnaireQuestionStepProps {
  question: UserFeedbackQuestionItem;
  answers: UserFeedbackAnswer[];
  customMode: boolean;
  customText: string;
  onSelectOption: (option: UserFeedbackQuestionOption, index: number) => void;
  onEnableCustom: () => void;
  onRemoveCustom: () => void;
  onCustomTextChange: (text: string) => void;
  onCustomSubmit: () => void;
  onCancelCustom: () => void;
}

export function QuestionnaireQuestionStep({
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
}: QuestionnaireQuestionStepProps) {
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
        {question.options.map((option, index) => {
          const isSelected = answers.some(
            (answer) => !answer.wasCustom && answer.value === option.value,
          );
          return (
            <button type="button"
              key={option.value}
              onClick={() => onSelectOption(option, index)}
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
                <Button size="sm" variant="ghost" onClick={onEnableCustom}>
                  Edit
                </Button>
                {question.multiSelect && (
                  <Button size="sm" variant="ghost" onClick={onRemoveCustom}>
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {question.allowOther && !customMode && !customAnswer && (
          <button type="button"
            onClick={onEnableCustom}
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
            <input aria-label="Text input"
              type="text"
              value={customText}
              onChange={(event) => onCustomTextChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onCustomSubmit();
                if (event.key === 'Escape') onCancelCustom();
              }}
              placeholder="Type your answer…"
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Button size="sm" onClick={onCustomSubmit} disabled={!customText.trim()}>
              Submit
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancelCustom}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
