import { useMemo, useState } from 'react';
import { Badge, Button, Card, Textarea } from '@sero-ai/ui';
import { MessageCircleQuestion } from 'lucide-react';
import type { HumanQuestion, InputAnswer, Loop, OrchestratorAction } from '../../shared/types';

interface InputRequestCardProps {
  loop: Loop;
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
}

/** Per-question draft answer: a picked choice and/or free text. */
type Draft = Record<string, { choiceId?: string; text: string }>;

function isAnswered(q: HumanQuestion, draft: Draft): boolean {
  const d = draft[q.id];
  return Boolean(d && (d.choiceId || d.text.trim()));
}

/**
 * The "needs your input" card. Renders the loop's pending question(s) — from a
 * paused step or the planner — with optional quick-pick choices plus a free-text
 * box, and submits all answers at once. The loop stays parked until answered.
 */
export function InputRequestCard({ loop, busy, onAction }: InputRequestCardProps) {
  const pending = loop.runtime.pendingInput;
  const [draft, setDraft] = useState<Draft>({});

  const allAnswered = useMemo(
    () => (pending ? pending.questions.every((q) => isAnswered(q, draft)) : false),
    [pending, draft],
  );

  if (!pending) return null;
  const fromPlanner = pending.source === 'planner';

  const setChoice = (qid: string, choiceId: string) =>
    setDraft((d) => ({ ...d, [qid]: { choiceId: d[qid]?.choiceId === choiceId ? undefined : choiceId, text: d[qid]?.text ?? '' } }));
  const setText = (qid: string, text: string) =>
    setDraft((d) => ({ ...d, [qid]: { choiceId: d[qid]?.choiceId, text } }));

  const submit = () => {
    const answers: InputAnswer[] = pending.questions.map((q) => {
      const d = draft[q.id];
      const text = d?.text.trim();
      return { questionId: q.id, ...(d?.choiceId ? { choiceId: d.choiceId } : {}), ...(text ? { text } : {}) };
    });
    onAction({ kind: 'answer_input', loopId: loop.id, requestId: pending.id, answers });
  };

  return (
    <Card className="flex flex-col gap-3 border-primary/40 p-3">
      <div className="flex items-center gap-2">
        <MessageCircleQuestion className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">
          {fromPlanner ? 'The planner needs a few answers first' : 'Needs your input'}
        </h2>
        <Badge variant="outline" className="text-[10px]">
          {pending.questions.length} question{pending.questions.length === 1 ? '' : 's'}
        </Badge>
      </div>

      {pending.questions.map((q, i) => (
        <div key={q.id} className="flex flex-col gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0">
          {pending.questions.length > 1 && (
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Question {i + 1} of {pending.questions.length}
            </span>
          )}
          <p className="text-sm">{q.prompt}</p>
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
            className="min-h-[56px] text-sm"
          />
        </div>
      ))}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
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
