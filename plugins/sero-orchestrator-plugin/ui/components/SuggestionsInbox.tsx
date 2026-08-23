import { useState } from 'react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card } from '@sero-ai/ui/components/ui/card';
import { Input } from '@sero-ai/ui/components/ui/input';
import { Check, Lightbulb, X } from 'lucide-react';
import type { Loop, OrchestratorAction } from '../../shared/types';

interface SuggestionsInboxProps {
  loop: Loop;
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
}

/**
 * The reflection inbox: pending improvement suggestions the user approves or
 * rejects. Approve applies the proposed plan (recorded as a revision); reject
 * keeps the suggestion with a reason so it isn't re-proposed. Renders nothing
 * until a loop has been reflected at least once.
 */
export function SuggestionsInbox({ loop, busy, onAction }: SuggestionsInboxProps) {
  const suggestions = loop.suggestions ?? [];
  const insights = loop.insights ?? [];
  const pending = suggestions.filter((s) => s.status === 'pending');
  const approved = suggestions.filter((s) => s.status === 'approved').length;
  const rejected = suggestions.filter((s) => s.status === 'rejected').length;
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  if (suggestions.length === 0 && insights.length === 0) return null;

  const approve = (id: string) =>
    onAction({ kind: 'choose_suggestion', loopId: loop.id, suggestionId: id, decision: 'approve' });
  const confirmReject = (id: string) => {
    onAction({ kind: 'choose_suggestion', loopId: loop.id, suggestionId: id, decision: 'reject', rejectionReason: reason.trim() || undefined });
    setRejectingId(null);
    setReason('');
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Suggestions{pending.length > 0 && <span className="text-amber-500"> · {pending.length} pending</span>}
      </h2>

      {pending.length === 0 && suggestions.length > 0 && (
        <p className="text-xs text-muted-foreground">No pending suggestions. Reflect again after more runs.</p>
      )}

      {pending.map((s) => (
        <Card key={s.id} className="flex flex-col gap-2 p-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <Badge variant="outline" className="text-sm uppercase tracking-wide">{s.confidence} confidence</Badge>
          </div>
          <p className="text-base">{s.rationale}</p>
          {s.changedStepIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <span>Changes:</span>
              {s.changedStepIds.map((id) => (
                <code key={id} className="rounded bg-muted px-1.5 py-0.5 text-sm">{id}</code>
              ))}
            </div>
          )}
          {rejectingId === s.id ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why reject? (so it isn't suggested again)"
                className="h-8 text-xs"
              />
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => confirmReject(s.id)}>Confirm</Button>
              <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setReason(''); }}>Cancel</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={busy} onClick={() => approve(s.id)}>
                <Check className="mr-1 h-3.5 w-3.5" /> Approve
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejectingId(s.id)}>
                <X className="mr-1 h-3.5 w-3.5" /> Reject
              </Button>
            </div>
          )}
        </Card>
      ))}

      {(approved > 0 || rejected > 0) && (
        <p className="text-xs text-muted-foreground">Earlier: {approved} approved · {rejected} rejected</p>
      )}

      {insights.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">What reflection has learned ({insights.length})</summary>
          <ul className="ml-4 mt-1 list-disc">
            {insights.map((i) => <li key={i.id}>{i.summary}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
