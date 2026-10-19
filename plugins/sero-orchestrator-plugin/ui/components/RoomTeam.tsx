/**
 * The Team table: who is on the Room, what each member runs on, and whether a
 * setup change is waiting. Every fact appears once; a pending value sits under
 * the effective one and never replaces it.
 */

import { ArrowRight, ChevronRight } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import type { RoomRevision } from '../../shared/room-message-types';
import type { RoomMember } from '../../shared/room-types';
import { memberGlyph } from '../lib/member-glyph';
import { teamRows, type TeamRow } from '../lib/room-team';
import { useStateDir } from '../lib/use-orchestrator-index';
import { useWatchedJson } from '../lib/use-watched-json';
import type { RoomFeedDispatch } from '../lib/use-room-feed';

const GRID = 'grid grid-cols-[minmax(0,1fr)_160px_190px_210px] items-start gap-x-4';
const NO_REVISIONS: RoomRevision[] = [];

interface RoomTeamProps {
  roomId: string;
  memberIds: string[];
  members: Map<string, RoomMember>;
  busy: boolean;
  dispatch: RoomFeedDispatch;
  onOpenMember: (memberId: string) => void;
}

export function RoomTeam({ roomId, memberIds, members, busy, dispatch, onOpenMember }: RoomTeamProps) {
  const stateDir = useStateDir();
  const revisions = useWatchedJson<RoomRevision[]>(
    stateDir ? `${stateDir}/rooms/${roomId}/revisions.json` : null,
    NO_REVISIONS,
  );
  const rows = teamRows(memberIds, members, revisions);
  const decide = (action: 'approve_revision' | 'decline_revision', revisionId: string) =>
    void dispatch({ action, roomId, revisionId });

  return (
    <div className="min-w-0 flex-1 overflow-y-auto px-[26px] pb-[30px] pt-[22px]">
      <div className="mb-2.5 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-room-text3">
        Team <span className="room-mono-micro normal-case tracking-normal">{rows.length}</span>
      </div>
      <div className="rounded-[10px] border border-room-line bg-room-surface px-[18px] py-1">
        <div className={cn(GRID, 'pb-2 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-room-text4')}>
          <span>Member</span><span>Model</span><span>Tools</span><span>State</span>
        </div>
        {rows.map((row) => (
          <TeamRowView key={row.key} row={row} busy={busy} onOpenMember={onOpenMember} onDecide={decide} />
        ))}
      </div>
    </div>
  );
}

function Value({ value, next, muted }: { value: string; next: string | null; muted: boolean }) {
  return (
    <div>
      <div className={cn('break-words font-mono text-xs', muted ? 'text-room-text3' : 'text-room-text')}>{value}</div>
      {next && (
        <div className="mt-[3px] flex items-center gap-[5px] font-mono text-xs text-status-warning">
          <ArrowRight aria-hidden="true" className="size-3.5 shrink-0" />
          {next}
        </div>
      )}
    </div>
  );
}

function TeamRowView({
  row,
  busy,
  onOpenMember,
  onDecide,
}: {
  row: TeamRow;
  busy: boolean;
  onOpenMember: (memberId: string) => void;
  onDecide: (action: 'approve_revision' | 'decline_revision', revisionId: string) => void;
}) {
  return (
    <div className={cn(GRID, 'border-t border-room-line py-3')}>
      <div className="flex min-w-0 gap-[11px]">
        <span aria-hidden="true" className="grid size-[26px] shrink-0 place-items-center rounded-full bg-room-raised text-[11px] font-semibold text-room-text2">
          {memberGlyph(row.name)}
        </span>
        <div className="min-w-0">
          <b className={cn('block text-[13px] tracking-[-0.01em]', row.retired ? 'font-medium text-room-text3' : 'font-semibold text-room-text')}>{row.name}</b>
          <span className="block text-xs text-room-text3">{row.line}</span>
        </div>
      </div>
      <Value value={row.model} next={row.pendingModel} muted={row.retired} />
      <Value value={row.tools} next={row.pendingTools} muted={row.retired} />
      <div className="text-xs text-room-text2">
        {row.history && row.memberId ? (
          <button
            type="button"
            onClick={() => onOpenMember(row.memberId ?? '')}
            className="mt-0.5 inline-flex items-center gap-[5px] text-[11px] text-brand-primary hover:underline"
          >
            History <ChevronRight aria-hidden="true" className="size-3.5" />
          </button>
        ) : (
          <>
            {row.status}
            {row.note && <small className="block text-xs text-room-text3">{row.note}</small>}
            {row.decide && (
              <div className="mt-1.5 flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => onDecide('approve_revision', row.decide?.revisionId ?? '')}>Approve</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => onDecide('decline_revision', row.decide?.revisionId ?? '')}>Decline</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
