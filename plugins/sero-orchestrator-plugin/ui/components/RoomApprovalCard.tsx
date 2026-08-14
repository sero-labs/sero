/**
 * One Room member's request for authority (agent-rooms spec §22, FR-026).
 *
 * The same card serves the cross-loop "Needs you" inbox and the Room's own
 * approval queue, because they are one decision with two entry points — and a
 * user must not be shown a request one way in one place and another way in
 * another. Only the user answers it; no member can, not even the Conductor.
 */

import { Button, Card } from '@sero-ai/ui';
import { ShieldQuestion } from 'lucide-react';
import type { RoomAttentionApproval } from '../../shared/attention-types';
import type { RoomSummary } from '../../shared/room-types';
import { OpenLink } from './OpenLink';

export type RoomApprovalDecision = 'approved' | 'rejected';

/**
 * One Room member's request for authority. The title, consequence and affected
 * target are computed by the runtime; only `reason` is the member's own words,
 * so it is attributed to the member.
 */
export function RoomApprovalCard({
  room,
  approval,
  busy,
  onDecide,
  onOpenRoom,
}: {
  room: RoomSummary;
  approval: RoomAttentionApproval;
  busy: boolean;
  onDecide?: (roomId: string, approvalId: string, decision: RoomApprovalDecision) => void;
  onOpenRoom?: (roomId: string) => void;
}) {
  return (
    <Card className="flex flex-col gap-2 border-violet-500/30 bg-violet-500/[0.06] p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-violet-500/20 text-violet-400">
          <ShieldQuestion className="h-3 w-3" />
        </span>
        <span className="text-base font-semibold text-violet-400">{approval.memberName} needs your approval</span>
        {onOpenRoom && <span className="ml-auto"><OpenLink title="Open" onClick={() => onOpenRoom(room.id)} /></span>}
      </div>
      <span className="text-base font-medium">{room.title}</span>
      <p className="text-base">{approval.title}</p>
      <p className="text-base text-muted-foreground">{approval.consequence}</p>
      {/* The send is bound to this exact text, so approving without seeing it
          would be approving something else. */}
      {approval.payload && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-background/60 p-2 text-xs">
          {approval.payload}
        </pre>
      )}
      <p className="text-xs text-muted-foreground">
        {approval.memberName} asked: {approval.reason}
      </p>
      <span className="text-xs text-muted-foreground">
        Affects {approval.affects}
        {approval.estimatedCostUsd !== null && ` · about $${approval.estimatedCostUsd.toFixed(2)}`}
      </span>
      <div className="mt-auto flex items-center gap-2">
        <Button size="sm" disabled={busy || !onDecide} onClick={() => onDecide?.(room.id, approval.approvalId, 'approved')}>
          Approve
        </Button>
        <Button size="sm" variant="ghost" disabled={busy || !onDecide} onClick={() => onDecide?.(room.id, approval.approvalId, 'rejected')}>
          Reject
        </Button>
      </div>
    </Card>
  );
}
