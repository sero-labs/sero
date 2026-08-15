/**
 * One Room member's request for authority (agent-rooms spec §22, FR-026).
 *
 * The same card serves the cross-loop "Needs you" inbox and the Room's own
 * approval queue, because they are one decision with two entry points — and a
 * user must not be shown a request one way in one place and another way in
 * another. Only the user answers it; no member can, not even the Conductor.
 */

import { Button } from '@sero-ai/ui';
import type { RoomAttentionApproval } from '../../shared/attention-types';
import type { RoomSummary } from '../../shared/room-types';
import { EventCard, Pill } from './room-kit';
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
    <EventCard
      tone="warn"
      title={approval.title}
      pill={<Pill tone="warn">{approval.memberName}</Pill>}
      actions={
        <>
          <Button size="sm" className="h-[26px] px-2.5 text-[11px]" disabled={busy || !onDecide} onClick={() => onDecide?.(room.id, approval.approvalId, 'approved')}>
            Approve
          </Button>
          <Button size="sm" variant="ghost" className="h-[26px] px-2.5 text-[11px]" disabled={busy || !onDecide} onClick={() => onDecide?.(room.id, approval.approvalId, 'rejected')}>
            Reject
          </Button>
          {onOpenRoom && <span className="ml-auto self-center"><OpenLink title="Open" onClick={() => onOpenRoom(room.id)} /></span>}
        </>
      }
    >
      <p className="text-xs text-room-text2">{approval.consequence}</p>
      {/* The send is bound to this exact text, so approving without seeing it
          would be approving something else. */}
      {approval.payload && (
        <pre className="room-tabular mt-2 max-h-40 overflow-auto rounded-[7px] border border-room-line-strong bg-room-sunken p-2 text-[10px] whitespace-pre-wrap text-room-text3">
          {approval.payload}
        </pre>
      )}
      <p className="mt-2">
        {approval.memberName} asked: {approval.reason}
      </p>
      <p className="mt-1 text-[10px]">
        Affects {approval.affects}
        {approval.estimatedCostUsd !== null && ` · about $${approval.estimatedCostUsd.toFixed(2)}`}
      </p>
    </EventCard>
  );
}
