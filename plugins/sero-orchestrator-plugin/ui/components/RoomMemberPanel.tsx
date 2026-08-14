/**
 * Inside one member's session (prototype screen 10).
 *
 * A member is a standard persistent Pi session, so its complete history is real
 * and readable: everything here is read from the session file, not rebuilt from
 * Room records. That is why it still works for a member that is disposed,
 * retired, replaced or failed, and why it reads straight through a compaction
 * boundary instead of stopping at it.
 *
 * The pane follows the live turn by default. Turning Follow off leaves the
 * scroll where the user put it, which is the whole point of reading history
 * while the member is still working.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Textarea } from '@sero-ai/ui';
import type { PersistentSessionHistoryEntry } from '@sero-ai/common';
import { X } from 'lucide-react';
import type { MemberLiveSnapshot } from '../../shared/room-live-types';
import type { RoomMember } from '../../shared/room-types';
import { formatCost, formatTime } from '../lib/format';
import { toSessionTurns, type SessionTurn } from '../lib/room-view';
import { useMemberContext, useMemberHistory, type RoomFeedDispatch } from '../lib/use-room-feed';
import {
  MEMBER_TAB_LABEL,
  MemberLiveRail,
  MemberTabPanel,
  type MemberTab,
} from './RoomMemberFacts';
import { MEMBER_DOT } from './RoomRoster';

/** Turns shown before the early history is folded away. */
const RECENT_TURNS = 6;

interface RoomMemberPanelProps {
  roomId: string;
  member: RoomMember;
  live: MemberLiveSnapshot | null;
  /** The envelope's per-member spend ceiling, so cost reads against its limit. */
  maxCostUsd: number;
  busy: boolean;
  dispatch: RoomFeedDispatch;
  onWake: () => void;
  /** Tells this member alone, as the Room rather than as a peer. */
  onMessage: () => void;
  /** Answers, on the user's behalf, the question this member is blocked on. */
  onAnswer: (body: string) => void;
  /** Releases it from a question that is never going to be answered. */
  onRelease: () => void;
  onClose: () => void;
}

export function RoomMemberPanel({
  roomId,
  member,
  live,
  maxCostUsd,
  busy,
  dispatch,
  onWake,
  onMessage,
  onAnswer,
  onRelease,
  onClose,
}: RoomMemberPanelProps) {
  const [tab, setTab] = useState<MemberTab>('session');
  const [follow, setFollow] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // The member's own turn count is what makes its history and its context
  // pressure change, so it is the signal both re-reads follow.
  const signal = `${member.usage.turns}:${member.session.compactionCount}:${member.status}`;
  const history = useMemberHistory(roomId, member.id, dispatch, signal);
  const context = useMemberContext(roomId, member.id, dispatch, signal);
  const turns = useMemo(() => toSessionTurns(history.entries), [history.entries]);
  const shown = expanded ? turns : turns.slice(-RECENT_TURNS);
  const hidden = turns.length - shown.length;

  // Following the live turn is a scroll position, which only the DOM holds.
  useEffect(() => {
    if (follow && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [follow, live?.text, turns.length]);

  const jumpTo = (index: number) => {
    setExpanded(true);
    // The turn may only exist after the fold opens, so the scroll waits a frame.
    requestAnimationFrame(() => document.getElementById(`turn-${member.id}-${index}`)?.scrollIntoView({ block: 'start' }));
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2">
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${MEMBER_DOT[member.status]}`} />
        <b className="text-sm">{member.displayName}</b>
        <span className="text-xs text-muted-foreground">
          {member.configuration.model} · {member.configuration.thinking} · {member.usage.turns} turn(s) ·{' '}
          {formatCost(member.usage.costUsd)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" disabled={busy} onClick={onMessage}>Message</Button>
          {/* Blocked is included: waking it is the user saying "start it anyway". */}
          {(member.status === 'waiting' || member.status === 'idle' || member.status === 'blocked') && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onWake}>Wake</Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-3.5 w-3.5" /></Button>
        </div>
        <div role="tablist" aria-label="Member detail" className="flex w-full gap-1">
          {(Object.keys(MEMBER_TAB_LABEL) as MemberTab[]).map((option) => (
            <Button
              key={option}
              size="sm"
              role="tab"
              aria-selected={tab === option}
              variant={tab === option ? 'secondary' : 'ghost'}
              onClick={() => setTab(option)}
            >
              {MEMBER_TAB_LABEL[option]}
            </Button>
          ))}
        </div>
      </div>

      {member.status === 'waiting' && (
        <WaitingStrip busy={busy} detail={member.statusDetail} onAnswer={onAnswer} onRelease={onRelease} />
      )}

      {tab !== 'session' ? (
        <MemberTabPanel tab={tab} member={member} live={live} context={context} maxCostUsd={maxCostUsd} />
      ) : (
        <div role="tabpanel" aria-label={MEMBER_TAB_LABEL.session} className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
              <span className={live?.turnId ? 'text-emerald-400' : 'text-muted-foreground'}>
                {live?.turnId ? 'Live' : member.statusDetail}
              </span>
              {live?.toolInFlight && (
                <span className="truncate font-mono text-muted-foreground">{live.toolInFlight.summary}</span>
              )}
              <Button
                size="sm"
                aria-pressed={follow}
                variant={follow ? 'secondary' : 'ghost'}
                className="ml-auto"
                onClick={() => setFollow(!follow)}
              >
                Follow
              </Button>
            </div>

            <TurnStrip turns={turns} onJump={jumpTo} />

            <div ref={scroller} className="flex flex-1 flex-col gap-3 overflow-auto p-3">
              {history.olderCursor && expanded && (
                <Button size="sm" variant="ghost" disabled={history.loadingOlder} onClick={history.loadOlder}>
                  {history.loadingOlder ? 'Reading…' : 'Load earlier turns'}
                </Button>
              )}
              {hidden > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setExpanded(true)}>
                  Show {hidden} earlier turn(s)
                </Button>
              )}
              {turns.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {member.session.sessionId ? 'Reading this session…' : 'This member has not started yet.'}
                </p>
              )}
              {shown.map((turn) => (
                <TurnBlock key={turn.index} memberId={member.id} turn={turn} />
              ))}
              {/* Only mid-turn: the retained text outlives the turn, and the
                  finished turn arrives in the transcript above from the session
                  file itself. */}
              {live?.turnId && live.text && (
                <div className="rounded-md border border-emerald-500/30 p-2.5">
                  <p className="text-xs text-emerald-400">In progress</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{live.text}</p>
                </div>
              )}
            </div>
          </div>

          <MemberLiveRail member={member} live={live} context={context} />
        </div>
      )}
    </div>
  );
}

/**
 * A waiting member, and the two ways only the user can end the wait.
 *
 * The question is between two members, so the strip must not read as a question
 * to the user: the answer box stays closed until the user asks for it. Waiting
 * also has to read as normal and free, because it is how the Room stays inside
 * its concurrency limit — a user who reads it as a stall will stop a Room that
 * is working perfectly.
 */
function WaitingStrip({
  busy,
  detail,
  onAnswer,
  onRelease,
}: {
  busy: boolean;
  detail: string;
  onAnswer: (body: string) => void;
  onRelease: () => void;
}) {
  const [body, setBody] = useState('');
  const [answering, setAnswering] = useState(false);

  return (
    <div className="flex flex-col gap-2 border-b border-amber-500/30 bg-amber-500/[0.06] px-3 py-2">
      <p className="text-sm">{detail}</p>
      <p className="text-xs text-muted-foreground">
        Nothing is needed from you. This costs nothing: its turn ended and its slot went back to the team, and it
        starts again the moment the answer lands, in the same session, with everything it already knew.
      </p>
      {answering && (
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={2}
          autoFocus
          placeholder="Answer in place of the member it asked…"
        />
      )}
      <div className="flex gap-2">
        {answering ? (
          <Button
            size="sm"
            disabled={busy || body.trim().length === 0}
            onClick={() => {
              onAnswer(body.trim());
              setBody('');
              setAnswering(false);
            }}
          >
            Send answer
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAnswering(true)}>
            Answer it yourself
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={onRelease}>Cancel the question</Button>
      </div>
    </div>
  );
}

/**
 * The whole session at a glance: one mark per turn, compactions marked in
 * place. A user can jump anywhere in the history, including before a
 * compaction — the file kept it, so the panel must be able to reach it.
 */
function TurnStrip({ turns, onJump }: { turns: SessionTurn[]; onJump: (index: number) => void }) {
  if (turns.length === 0) return null;
  const compactions = turns.filter((turn) => turn.compacted).length;

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-3 py-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">Turns</span>
      {turns.map((turn) => (
        <button
          key={turn.index}
          type="button"
          title={`Turn ${turn.index} · ${formatTime(turn.at)}`}
          aria-label={`Go to turn ${turn.index}${turn.compacted ? ', compacted' : ''}`}
          onClick={() => onJump(turn.index)}
          className={`h-3 w-1.5 shrink-0 rounded-sm ${turn.compacted ? 'bg-sky-500' : 'bg-muted-foreground/40'} hover:bg-foreground`}
        />
      ))}
      {compactions > 0 && (
        <span className="ml-2 shrink-0 text-xs text-muted-foreground">{compactions} compaction(s)</span>
      )}
    </div>
  );
}

function TurnBlock({ memberId, turn }: { memberId: string; turn: SessionTurn }) {
  return (
    <div id={`turn-${memberId}-${turn.index}`} className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">
        Turn {turn.index} · {formatTime(turn.at)}
      </p>
      {turn.compacted && (
        <p className="text-xs text-sky-400">
          Context compacted here. The checkpoint, mandate and Room brief were carried across.
        </p>
      )}
      {turn.entries.map((entry, position) => (
        <p
          key={`${entry.timestamp}:${position}`}
          className={`whitespace-pre-wrap rounded-md p-2 text-sm ${
            entry.role === 'assistant'
              ? 'bg-accent/40'
              : entry.role === 'tool'
                ? 'bg-muted/40 font-mono text-xs'
                : 'border border-border'
          }`}
        >
          {entry.text}
        </p>
      ))}
    </div>
  );
}
