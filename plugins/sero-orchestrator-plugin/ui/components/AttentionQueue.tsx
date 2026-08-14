/**
 * The cross-loop "Needs you" queue (specs/09-ui-redesign.md, A2 hybrid). Renders
 * every loop's pending questions and suggestions from the watched index's
 * attention payload, side by side, so the user resolves them inline — answering a
 * question or approving/rejecting a suggestion — without opening each loop. All
 * actions reuse the existing coordinator actions (answer_input / choose_suggestion).
 *
 * Room approvals join the SAME queue (agent-rooms spec §22, FR-026): one inbox
 * for every member of every Room, beside the Workflow items, read from the Room
 * index's own attention payload. Only the user answers them — no Room member,
 * not even the Conductor — which the runtime enforces independently.
 */

import { useMemo, useState } from 'react';
import { Button, Card, Textarea } from '@sero-ai/ui';
import { Sparkles } from 'lucide-react';
import type { LoopAttentionInput, LoopAttentionSuggestion, LoopSummary, OrchestratorAction } from '../../shared/types';
import type { RoomSummary } from '../../shared/room-types';
import { allAnswered, buildAnswers, withChoice, withText, type AnswerDraft } from '../lib/answer-draft';
import { OpenLink } from './OpenLink';
import { RoomApprovalCard, type RoomApprovalDecision } from './RoomApprovalCard';
import { RoomPauseCard, RoomRequestCard } from './RoomAttentionCards';

export type { RoomApprovalDecision };

interface AttentionQueueProps {
  loops: LoopSummary[];
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
  onOpenLoop: (loopId: string) => void;
  /** Rooms from the watched Room index. Absent until Room mode is mounted. */
  rooms?: RoomSummary[];
  onRoomApproval?: (roomId: string, approvalId: string, decision: RoomApprovalDecision) => void;
  /** Answers a member that stopped to ask the user something. */
  onRoomAnswer?: (roomId: string, memberId: string, body: string) => void;
  /** Starts a Room that stopped and cannot start itself. */
  onRoomResume?: (roomId: string) => void;
  onOpenRoom?: (roomId: string) => void;
}

export function AttentionQueue({
  loops,
  busy,
  onAction,
  onOpenLoop,
  rooms = [],
  onRoomApproval,
  onRoomAnswer,
  onRoomResume,
  onOpenRoom,
}: AttentionQueueProps) {
  const inputs = loops.flatMap((l) => (l.attention?.input ? [{ loop: l, input: l.attention.input }] : []));
  const suggestions = loops.flatMap((l) => (l.attention?.suggestions ?? []).map((s) => ({ loop: l, suggestion: s })));
  const approvals = rooms.flatMap((room) => (room.attention?.approvals ?? []).map((approval) => ({ room, approval })));
  // A question a member asked the user, and a Room that stopped for one: both
  // need the user, and both used to be visible only inside the Room itself.
  const requests = rooms.flatMap((room) => (room.attention?.requests ?? []).map((request) => ({ room, request })));
  const pauses = rooms.flatMap((room) => (room.attention?.pause ? [{ room, pause: room.attention.pause }] : []));

  if (inputs.length === 0 && suggestions.length === 0 && approvals.length === 0 && requests.length === 0 && pauses.length === 0) {
    return <p className="text-base text-muted-foreground">Nothing needs you right now.</p>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {approvals.map(({ room, approval }) => (
        <RoomApprovalCard
          key={`${room.id}:${approval.approvalId}`}
          room={room}
          approval={approval}
          busy={busy}
          onDecide={onRoomApproval}
          onOpenRoom={onOpenRoom}
        />
      ))}
      {requests.map(({ room, request }) => (
        <RoomRequestCard
          key={`${room.id}:${request.memberId}`}
          room={room}
          request={request}
          busy={busy}
          onAnswer={onRoomAnswer}
          onOpenRoom={onOpenRoom}
        />
      ))}
      {pauses.map(({ room, pause }) => (
        <RoomPauseCard
          key={`${room.id}:pause`}
          room={room}
          pause={pause}
          busy={busy}
          onResume={onRoomResume}
          onOpenRoom={onOpenRoom}
        />
      ))}
      {inputs.map(({ loop, input }) => (
        <AttentionInputCard key={`${loop.id}:${input.requestId}`} loop={loop} input={input} busy={busy} onAction={onAction} onOpenLoop={onOpenLoop} />
      ))}
      {suggestions.map(({ loop, suggestion }) => (
        <AttentionSuggestionCard key={`${loop.id}:${suggestion.id}`} loop={loop} suggestion={suggestion} busy={busy} onAction={onAction} onOpenLoop={onOpenLoop} />
      ))}
    </div>
  );
}


function AttentionInputCard({ loop, input, busy, onAction, onOpenLoop }: { loop: LoopSummary; input: LoopAttentionInput; busy: boolean; onAction: AttentionQueueProps['onAction']; onOpenLoop: (id: string) => void }) {
  const [draft, setDraft] = useState<AnswerDraft>({});
  const ready = useMemo(() => allAnswered(input.questions, draft), [input.questions, draft]);
  const fromPlanner = input.source === 'planner';

  return (
    <Card className="flex flex-col gap-2 border-amber-500/30 bg-amber-500/[0.06] p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-amber-500/20 text-sm font-bold text-amber-400">?</span>
        <span className="text-base font-semibold text-amber-400">{fromPlanner ? 'Planner needs answers' : 'Waiting on your answer'}</span>
        <span className="ml-auto"><OpenLink title="Open" onClick={() => onOpenLoop(loop.id)} /></span>
      </div>
      <span className="text-base font-medium">{loop.title}</span>
      {input.questions.map((q) => (
        <div key={q.id} className="flex flex-col gap-2">
          <p className="text-base text-muted-foreground">{q.prompt}</p>
          {q.attachment && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-xs">
              {q.attachment}
            </pre>
          )}
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
            className="min-h-12 text-base"
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
    <Card className="flex flex-col gap-2 border-sky-500/30 bg-sky-500/[0.06] p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-sky-500/20 text-sky-400"><Sparkles className="h-3 w-3" /></span>
        <span className="text-base font-semibold text-sky-400">Suggested improvement</span>
        <span className="ml-auto text-sm uppercase tracking-wide text-muted-foreground">conf. {CONFIDENCE_LABEL[suggestion.confidence]}</span>
      </div>
      <span className="text-base font-medium">{loop.title}</span>
      <p className="text-base text-muted-foreground">{suggestion.rationale}</p>
      <span className="text-xs text-muted-foreground">Changes {suggestion.changedStepCount} step(s).</span>
      {rejecting ? (
        <div className="flex flex-col gap-2">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why reject? (helps future suggestions)" className="min-h-11 text-base" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>Cancel</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction({ kind: 'choose_suggestion', loopId: loop.id, suggestionId: suggestion.id, decision: 'reject', rejectionReason: reason.trim() || undefined })}>
              Reject
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-auto flex items-center gap-2">
          <Button size="sm" disabled={busy} onClick={() => onAction({ kind: 'choose_suggestion', loopId: loop.id, suggestionId: suggestion.id, decision: 'approve' })}>
            Approve
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRejecting(true)}>Reject</Button>
          <span className="ml-auto"><OpenLink title="Review" onClick={() => onOpenLoop(loop.id)} /></span>
        </div>
      )}
    </Card>
  );
}
