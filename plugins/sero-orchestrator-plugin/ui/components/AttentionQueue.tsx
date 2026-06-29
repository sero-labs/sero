/**
 * The cross-loop "Needs you" queue (specs/09-ui-redesign.md, A2 hybrid). Renders
 * every loop's pending questions and suggestions from the watched index's
 * attention payload, so the user resolves them inline — answering a question or
 * approving/rejecting a suggestion — without opening each loop. All actions reuse
 * the existing coordinator actions (answer_input / choose_suggestion).
 */

import { useMemo, useState } from 'react';
import { Badge, Button, Card, Textarea } from '@sero-ai/ui';
import { MessageCircleQuestion, Sparkles, ArrowRight } from 'lucide-react';
import type { LoopAttentionInput, LoopAttentionSuggestion, LoopSummary, OrchestratorAction } from '../../shared/types';
import { allAnswered, buildAnswers, withChoice, withText, type AnswerDraft } from '../lib/answer-draft';

interface AttentionQueueProps {
  loops: LoopSummary[];
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
  onOpenLoop: (loopId: string) => void;
}

export function AttentionQueue({ loops, busy, onAction, onOpenLoop }: AttentionQueueProps) {
  const inputs = loops.flatMap((l) => (l.attention?.input ? [{ loop: l, input: l.attention.input }] : []));
  const suggestions = loops.flatMap((l) =>
    (l.attention?.suggestions ?? []).map((s) => ({ loop: l, suggestion: s })),
  );

  if (inputs.length === 0 && suggestions.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing needs you right now.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {inputs.map(({ loop, input }) => (
        <AttentionInputCard key={`${loop.id}:${input.requestId}`} loop={loop} input={input} busy={busy} onAction={onAction} onOpenLoop={onOpenLoop} />
      ))}
      {suggestions.map(({ loop, suggestion }) => (
        <AttentionSuggestionCard key={`${loop.id}:${suggestion.id}`} loop={loop} suggestion={suggestion} busy={busy} onAction={onAction} onOpenLoop={onOpenLoop} />
      ))}
    </div>
  );
}

function OpenLink({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
      {title} <ArrowRight className="h-3.5 w-3.5" />
    </button>
  );
}

function AttentionInputCard({ loop, input, busy, onAction, onOpenLoop }: { loop: LoopSummary; input: LoopAttentionInput; busy: boolean; onAction: AttentionQueueProps['onAction']; onOpenLoop: (id: string) => void }) {
  const [draft, setDraft] = useState<AnswerDraft>({});
  const ready = useMemo(() => allAnswered(input.questions, draft), [input.questions, draft]);
  const fromPlanner = input.source === 'planner';

  return (
    <Card className="flex flex-col gap-2 border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-center gap-2">
        <MessageCircleQuestion className="h-4 w-4 text-amber-400" />
        <span className="text-sm font-semibold">{loop.title}</span>
        <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-[10px]">
          {fromPlanner ? 'planner needs answers' : 'waiting on you'}
        </Badge>
        <OpenLink title="Open" onClick={() => onOpenLoop(loop.id)} />
      </div>
      {input.questions.map((q) => (
        <div key={q.id} className="flex flex-col gap-2">
          <p className="text-sm">{q.prompt}</p>
          {q.choices && q.choices.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {q.choices.map((c) => (
                <Button key={c.id} size="sm" variant={draft[q.id]?.choiceId === c.id ? 'default' : 'outline'} disabled={busy} onClick={() => setDraft((d) => withChoice(d, q.id, c.id))}>
                  {c.label}
                </Button>
              ))}
            </div>
          )}
          <Textarea
            value={draft[q.id]?.text ?? ''}
            onChange={(e) => setDraft((d) => withText(d, q.id, e.target.value))}
            placeholder={q.choices?.length ? 'Or type your own answer…' : 'Type your answer…'}
            className="min-h-[48px] text-sm"
          />
        </div>
      ))}
      <Button
        size="sm"
        className="self-end"
        disabled={busy || !ready}
        onClick={() => onAction({ kind: 'answer_input', loopId: loop.id, requestId: input.requestId, answers: buildAnswers(input.questions, draft) })}
      >
        {fromPlanner ? 'Submit & build plan' : 'Send answer'}
      </Button>
    </Card>
  );
}

const CONFIDENCE_LABEL = { low: 'low', medium: 'med', high: 'high' } as const;

function AttentionSuggestionCard({ loop, suggestion, busy, onAction, onOpenLoop }: { loop: LoopSummary; suggestion: LoopAttentionSuggestion; busy: boolean; onAction: AttentionQueueProps['onAction']; onOpenLoop: (id: string) => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <Card className="flex flex-col gap-2 border-sky-500/30 bg-sky-500/5 p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-sky-400" />
        <span className="text-sm font-semibold">{loop.title}</span>
        <Badge variant="outline" className="border-sky-500/40 text-sky-400 text-[10px]">conf. {CONFIDENCE_LABEL[suggestion.confidence]}</Badge>
        <OpenLink title="Review" onClick={() => onOpenLoop(loop.id)} />
      </div>
      <p className="text-sm text-muted-foreground">{suggestion.rationale}</p>
      <span className="text-xs text-muted-foreground">Changes {suggestion.changedStepCount} step(s).</span>
      {rejecting ? (
        <div className="flex flex-col gap-2">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why reject? (helps future suggestions)" className="min-h-[44px] text-sm" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>Cancel</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction({ kind: 'choose_suggestion', loopId: loop.id, suggestionId: suggestion.id, decision: 'reject', rejectionReason: reason.trim() || undefined })}>
              Reject
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRejecting(true)}>Reject</Button>
          <Button size="sm" disabled={busy} onClick={() => onAction({ kind: 'choose_suggestion', loopId: loop.id, suggestionId: suggestion.id, decision: 'approve' })}>
            Approve
          </Button>
        </div>
      )}
    </Card>
  );
}
