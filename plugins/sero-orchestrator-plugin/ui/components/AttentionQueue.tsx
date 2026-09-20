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
import type { GoalIndexEntry } from '../../shared/goal-types';
import { WORKFLOW_LABEL } from '../../shared/labels';
import { goalNeedsAttention } from '../lib/attention-count';
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
  goals?: GoalIndexEntry[];
  onOpenGoal?: (goalId: string) => void;
}

interface QueueItem {
  key: string;
  status: MemberStatus;
  label: ReactNode;
  /** The Workflow, Room or Goal this belongs to. Printed once, above its items. */
  group: string;
  /** Its name alone, which the group heading leads with. */
  groupTitle: string;
  /** What kind of work it is, dimmed after the name. */
  groupKind: string;
  /** Extra provenance inside the group, such as the member who asked. */
  source?: string;
  actionLabel: string;
  detail: ReactNode;
}

/** Items in the order they arrived, gathered under the work they belong to. */
function byGroup(items: QueueItem[]): { group: string; items: QueueItem[] }[] {
  const groups = new Map<string, QueueItem[]>();
  for (const item of items) {
    const existing = groups.get(item.group);
    if (existing) existing.push(item);
    else groups.set(item.group, [item]);
  }
  return [...groups].map(([group, grouped]) => ({ group, items: grouped }));
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
  goals = [],
  onOpenGoal,
}: AttentionQueueProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const items: QueueItem[] = [
    ...goals.flatMap((goal): QueueItem[] => goalNeedsAttention(goal) ? [{
      key: `${goal.id}:goal-attention`,
      status: goal.status === 'blocked' ? 'blocked' : 'waiting',
      label: goal.blockReason ?? goal.waitReason ?? 'Held because three turns repeated with no tool call',
      group: `Goal · ${goal.objective}`,
      groupTitle: goal.objective,
      groupKind: 'Goal',
      actionLabel: 'Open',
      detail: (
        <div className="rounded-lg border border-room-line bg-room-surface p-3 text-xs text-room-text2">
          <p>{goal.status === 'waiting' ? 'This Goal waits for you to resume it.' : 'Review the Goal record and decide what happens next.'}</p>
          <Button size="sm" className="mt-3 h-7 text-xs" onClick={() => onOpenGoal?.(goal.id)}>Open Goal</Button>
        </div>
      ),
    }] : []),
    ...rooms.flatMap((room): QueueItem[] => {
      const pause = room.attention?.pause;
      return pause
        ? [{
            key: `${room.id}:pause`,
            status: 'blocked',
            label: <>This Room stopped — {pause.detail}</>,
            group: `Room · ${room.title}`,
            groupTitle: room.title,
            groupKind: 'Room',
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
        group: `Room · ${room.title}`,
        groupTitle: room.title,
        groupKind: 'Room',
        source: approval.memberName,
        actionLabel: 'Review',
        detail: <RoomApprovalCard room={room} approval={approval} busy={busy} onDecide={onRoomApproval} onOpenRoom={onOpenRoom} />,
      }))),
    ...rooms.flatMap((room): QueueItem[] =>
      (room.attention?.requests ?? []).map((request) => ({
        key: `${room.id}:${request.memberId}`,
        status: 'waiting',
        label: request.question,
        group: `Room · ${room.title}`,
        groupTitle: room.title,
        groupKind: 'Room',
        source: request.memberName,
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
            group: `${WORKFLOW_LABEL} · ${loop.title}`,
            groupTitle: loop.title,
            groupKind: WORKFLOW_LABEL,
            actionLabel: 'Answer',
            detail: <AttentionInputCard loop={loop} input={input} busy={busy} onAction={onAction} onOpenLoop={onOpenLoop} />,
          }]
        : [];
    }),
    ...loops.flatMap((loop): QueueItem[] =>
      (loop.attention?.suggestions ?? []).map((suggestion) => ({
        key: `${loop.id}:${suggestion.id}`,
        status: 'idle',
        label: `Suggested change · ${suggestion.changedStepCount} ${suggestion.changedStepCount === 1 ? 'step' : 'steps'}`,
        group: `${WORKFLOW_LABEL} · ${loop.title}`,
        groupTitle: loop.title,
        groupKind: WORKFLOW_LABEL,
        actionLabel: 'Review',
        detail: <AttentionSuggestionCard loop={loop} suggestion={suggestion} busy={busy} onAction={onAction} onOpenLoop={onOpenLoop} />,
      }))),
  ];

  if (items.length === 0) return null;

  return (
    <NeedsBand count={`${items.length} item${items.length === 1 ? '' : 's'}`}>
      {byGroup(items).map(({ group, items: grouped }) => (
        <div key={group} className="[&+div]:mt-3.5">
          {/* The name leads; what kind of work it is, and how much it is
              asking for, follow dimmed. The drawing prints the name once. */}
          <p className="text-[13px] font-medium text-room-text">
            {grouped[0].groupTitle}
            <span className="ml-1 text-[11px] font-normal text-room-text3">
              · {grouped[0].groupKind} · {grouped.length} {grouped.length === 1 ? 'item' : 'items'}
            </span>
          </p>
          <div className="mt-2">
          {grouped.map((item) => (
            <div key={item.key}>
              <NeedsRow
                source={item.source ?? ''}
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
          </div>
        </div>
      ))}
    </NeedsBand>
  );
}
