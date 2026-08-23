/**
 * The cross-mode "Needs you" band (prototype screen 1). Every pending item —
 * Room approvals, member questions, stopped Rooms, Workflow questions and
 * suggestions — is one row: dot, the ask, the source dimmed, the action
 * right. The action expands the item's full card inline, so the user still
 * resolves everything here without opening each Room or Workflow.
 *
 * Room approvals join the SAME queue (agent-rooms spec §22, FR-026); only the
 * user answers them — no Room member, not even the Conductor — which the
 * runtime enforces independently.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import type { LoopSummary, OrchestratorAction } from '../../shared/types';
import type { RoomSummary } from '../../shared/room-types';
import { AttentionInputCard, AttentionSuggestionCard } from './AttentionLoopCards';
import { NeedsBand, NeedsRow, type MemberStatus } from './room-kit';
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

interface QueueItem {
  key: string;
  status: MemberStatus;
  label: ReactNode;
  source: string;
  actionLabel: string;
  detail: ReactNode;
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
  const [openKey, setOpenKey] = useState<string | null>(null);

  const items: QueueItem[] = [
    ...rooms.flatMap((room): QueueItem[] => {
      const pause = room.attention?.pause;
      return pause
        ? [{
            key: `${room.id}:pause`,
            status: 'blocked',
            label: <>This Room stopped — {pause.detail}</>,
            source: `Room · ${room.title}`,
            actionLabel: 'Review',
            detail: <RoomPauseCard room={room} pause={pause} busy={busy} onResume={onRoomResume} onOpenRoom={onOpenRoom} />,
          }]
        : [];
    }),
    ...rooms.flatMap((room): QueueItem[] =>
      (room.attention?.approvals ?? []).map((approval) => ({
        key: `${room.id}:${approval.approvalId}`,
        status: 'waiting',
        label: approval.title,
        source: `Room · ${room.title} · ${approval.memberName}`,
        actionLabel: 'Review',
        detail: <RoomApprovalCard room={room} approval={approval} busy={busy} onDecide={onRoomApproval} onOpenRoom={onOpenRoom} />,
      }))),
    ...rooms.flatMap((room): QueueItem[] =>
      (room.attention?.requests ?? []).map((request) => ({
        key: `${room.id}:${request.memberId}`,
        status: 'waiting',
        label: request.question,
        source: `Room · ${room.title} · ${request.memberName}`,
        actionLabel: 'Answer',
        detail: <RoomRequestCard room={room} request={request} busy={busy} onAnswer={onRoomAnswer} onOpenRoom={onOpenRoom} />,
      }))),
    ...loops.flatMap((loop): QueueItem[] => {
      const input = loop.attention?.input;
      return input
        ? [{
            key: `${loop.id}:${input.requestId}`,
            status: 'waiting',
            label: input.questions.length === 1
              ? input.questions[0].prompt
              : `Answer ${input.questions.length} ${input.source === 'planner' ? 'planner ' : ''}questions`,
            source: `Workflow · ${loop.title}`,
            actionLabel: 'Answer',
            detail: <AttentionInputCard loop={loop} input={input} busy={busy} onAction={onAction} onOpenLoop={onOpenLoop} />,
          }]
        : [];
    }),
    ...loops.flatMap((loop): QueueItem[] =>
      (loop.attention?.suggestions ?? []).map((suggestion) => ({
        key: `${loop.id}:${suggestion.id}`,
        status: 'idle',
        label: `Suggested improvement — changes ${suggestion.changedStepCount} step(s)`,
        source: `Workflow · ${loop.title}`,
        actionLabel: 'Review',
        detail: <AttentionSuggestionCard loop={loop} suggestion={suggestion} busy={busy} onAction={onAction} onOpenLoop={onOpenLoop} />,
      }))),
  ];

  if (items.length === 0) return null;

  return (
    <NeedsBand count={`${items.length} item${items.length === 1 ? '' : 's'}`}>
      {items.map((item) => (
        <div key={item.key}>
          <NeedsRow
            status={item.status}
            source={item.source}
            action={
              <Button
                variant="outline"
                size="sm"
                className="h-[26px] px-2.5 text-[11px]"
                onClick={() => setOpenKey((k) => (k === item.key ? null : item.key))}
              >
                {openKey === item.key ? 'Close' : item.actionLabel}
              </Button>
            }
          >
            {item.label}
          </NeedsRow>
          {openKey === item.key && <div className="mt-2">{item.detail}</div>}
        </div>
      ))}
    </NeedsBand>
  );
}
