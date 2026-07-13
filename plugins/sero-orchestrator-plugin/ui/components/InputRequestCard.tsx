import { useMemo, useState } from 'react';
import { Badge, Button, Card, Textarea } from '@sero-ai/ui';
import { MessageCircleQuestion } from 'lucide-react';
import type { Loop, OrchestratorAction } from '../../shared/types';
import { allAnswered as allAnsweredFn, buildAnswers, withChoice, withText, type AnswerDraft } from '../lib/answer-draft';

interface InputRequestCardProps {
  loop: Loop;
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
}

/**
 * The "needs your input" card. Renders the loop's pending question(s) — from a
 * paused step or the planner — with optional quick-pick choices plus a free-text
 * box, and submits all answers at once. The loop stays parked until answered.
 */
export function InputRequestCard({ loop, busy, onAction }: InputRequestCardProps) {
  const pending = loop.runtime.pendingInput;
  const [draft, setDraft] = useState<AnswerDraft>({});

  const allAnswered = useMemo(
    () => (pending ? allAnsweredFn(pending.questions, draft) : false),
    [pending, draft],
  );

  if (!pending) return null;
  const fromPlanner = pending.source === 'planner';

  const setChoice = (qid: string, choiceId: string) => setDraft((d) => withChoice(d, qid, choiceId));
  const setText = (qid: string, text: string) => setDraft((d) => withText(d, qid, text));

  const submit = () =>
    onAction({ kind: 'answer_input', loopId: loop.id, requestId: pending.id, answers: buildAnswers(pending.questions, draft) });

  return (
    <Card className="flex flex-col gap-3 border-primary/40 p-3">
      <div className="flex items-center gap-2">
        <MessageCircleQuestion className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">
          {fromPlanner ? 'The planner needs a few answers first' : 'Needs your input'}
        </h2>
        <Badge variant="outline" className="text-sm">
          {pending.questions.length} question{pending.questions.length === 1 ? '' : 's'}
        </Badge>
      </div>

      {pending.questions.map((q, i) => (
        <div key={q.id} className="flex flex-col gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0">
          {pending.questions.length > 1 && (
            <span className="text-sm uppercase tracking-wide text-muted-foreground">
              Question {i + 1} of {pending.questions.length}
            </span>
          )}
          <p className="text-base">{q.prompt}</p>
          {q.attachment && (
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-xs">
              {q.attachment}
            </pre>
          )}
          {q.choices && q.choices.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {q.choices.map((c) => (
                <Button
                  key={c.id}
                  size="sm"
                  variant={draft[q.id]?.choiceId === c.id ? 'default' : 'outline'}
                  disabled={busy}
                  onClick={() => setChoice(q.id, c.id)}
                >
                  {c.label}
                </Button>
              ))}
            </div>
          )}
          <Textarea
            value={draft[q.id]?.text ?? ''}
            onChange={(e) => setText(q.id, e.target.value)}
            placeholder={q.choices?.length ? 'Or type your own answer…' : 'Type your answer…'}
            className="min-h-[56px] text-base"
          />
        </div>
      ))}

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {fromPlanner
            ? 'Your answers go back to the planner to build the plan.'
            : 'The step runs again with your answer. The loop waits until you answer.'}
        </span>
        <Button size="sm" disabled={busy || !allAnswered} onClick={submit}>
          {fromPlanner ? 'Submit answers & build the plan' : 'Send answer & continue'}
        </Button>
      </div>
    </Card>
  );
}
