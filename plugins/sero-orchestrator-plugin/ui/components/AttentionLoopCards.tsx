/**
 * The two Workflow "needs you" detail cards — a pending question answered
 * inline, and a reflection suggestion approved or rejected inline. They
 * expand under their row in the Needs-you band (AttentionQueue) and reuse
 * the coordinator actions (`answer_input` / `choose_suggestion`).
 */

import { useMemo, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Textarea } from '@sero-ai/ui/components/ui/textarea';
import type { LoopAttentionInput, LoopAttentionSuggestion, LoopSummary, OrchestratorAction } from '../../shared/types';
import { allAnswered, buildAnswers, withChoice, withText, type AnswerDraft } from '../lib/answer-draft';
import { EventCard, Pill } from './room-kit';
import { OpenLink } from './OpenLink';

interface LoopCardProps {
  loop: LoopSummary;
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
  onOpenLoop: (loopId: string) => void;
}

export function AttentionInputCard({ loop, input, busy, onAction, onOpenLoop }: LoopCardProps & { input: LoopAttentionInput }) {
  const [draft, setDraft] = useState<AnswerDraft>({});
  const ready = useMemo(() => allAnswered(input.questions, draft), [input.questions, draft]);
  const fromPlanner = input.source === 'planner';

  return (
    <EventCard
      tone="warn"
      title={fromPlanner ? 'Planner needs answers' : 'Waiting on your answer'}
      pill={<Pill tone="warn">{loop.title}</Pill>}
      actions={
        <>
          <Button
            size="sm"
            className="h-[26px] px-2.5 text-[11px]"
            disabled={busy || !ready}
            onClick={() => onAction({ kind: 'answer_input', loopId: loop.id, requestId: input.requestId, answers: buildAnswers(input.questions, draft) })}
          >
            {fromPlanner ? 'Submit & build plan' : 'Send answer'}
          </Button>
          <span className="ml-auto self-center"><OpenLink title="Open" onClick={() => onOpenLoop(loop.id)} /></span>
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        {input.questions.map((q) => (
          <div key={q.id} className="flex flex-col gap-2">
            <p className="text-xs text-room-text2">{q.prompt}</p>
            {q.attachment && (
              <pre className="room-tabular max-h-40 overflow-auto rounded-[7px] border border-room-line-strong bg-room-sunken p-2 text-[10px] whitespace-pre-wrap text-room-text3">
                {q.attachment}
              </pre>
            )}
            {q.choices && q.choices.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {q.choices.map((c) => (
                  <Button
                    key={c.id}
                    size="sm"
                    className="h-[26px] px-2.5 text-[11px]"
                    variant={draft[q.id]?.choiceId === c.id ? 'default' : 'outline'}
                    disabled={busy}
                    onClick={() => setDraft((d) => withChoice(d, q.id, c.id))}
                  >
                    {c.label}
                  </Button>
                ))}
              </div>
            )}
            <Textarea
              value={draft[q.id]?.text ?? ''}
              onChange={(e) => setDraft((d) => withText(d, q.id, e.target.value))}
              placeholder={q.choices?.length ? 'Or type your own answer…' : 'Type your answer…'}
              className="min-h-12 border-room-line-strong bg-room-sunken text-xs"
            />
          </div>
        ))}
      </div>
    </EventCard>
  );
}

const CONFIDENCE_LABEL = { low: 'low', medium: 'med', high: 'high' } as const;

export function AttentionSuggestionCard({ loop, suggestion, busy, onAction, onOpenLoop }: LoopCardProps & { suggestion: LoopAttentionSuggestion }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <EventCard
      tone="neutral"
      title="Suggested improvement"
      pill={<Pill tone="info">conf. {CONFIDENCE_LABEL[suggestion.confidence]}</Pill>}
      actions={
        rejecting ? undefined : (
          <>
            <Button
              size="sm"
              className="h-[26px] px-2.5 text-[11px]"
              disabled={busy}
              onClick={() => onAction({ kind: 'choose_suggestion', loopId: loop.id, suggestionId: suggestion.id, decision: 'approve' })}
            >
              Approve
            </Button>
            <Button size="sm" variant="ghost" className="h-[26px] px-2.5 text-[11px]" disabled={busy} onClick={() => setRejecting(true)}>
              Reject
            </Button>
            <span className="ml-auto self-center"><OpenLink title="Review" onClick={() => onOpenLoop(loop.id)} /></span>
          </>
        )
      }
    >
      <p>{suggestion.rationale}</p>
      <p className="mt-1 text-[10px]">Changes {suggestion.changedStepCount} step(s).</p>
      {rejecting && (
        <div className="mt-2 flex flex-col gap-2">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why reject? (helps future suggestions)"
            className="min-h-11 border-room-line-strong bg-room-sunken text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-[26px] px-2.5 text-[11px]" disabled={busy} onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-[26px] px-2.5 text-[11px]"
              disabled={busy}
              onClick={() => onAction({ kind: 'choose_suggestion', loopId: loop.id, suggestionId: suggestion.id, decision: 'reject', rejectionReason: reason.trim() || undefined })}
            >
              Reject
            </Button>
          </div>
        </div>
      )}
    </EventCard>
  );
}
