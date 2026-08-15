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
import { cn } from '@sero-ai/ui/lib/utils';
import { X } from 'lucide-react';
import type { MemberLiveSnapshot } from '../../shared/room-live-types';
import type { RoomMember } from '../../shared/room-types';
import { formatClock, formatCost, formatTimer } from '../lib/format';
import { memberGlyph } from '../lib/member-glyph';
import { toSessionTurns } from '../lib/room-view';
import { useMemberContext, useMemberHistory, type RoomFeedDispatch } from '../lib/use-room-feed';
import {
  MEMBER_TAB_LABEL,
  MemberLiveRail,
  MemberTabPanel,
  type MemberTab,
} from './RoomMemberFacts';
import { CollapsedHistory, LiveTurn, ToolLiveCard, TurnBlock, TurnStrip } from './RoomMemberTranscript';
import { Face, LivePill } from './room-kit';

/** Turns shown before the early history is folded away. */
const RECENT_TURNS = 6;

/** The prototype's small .btn (26px, 11px type). */
const SMALL_BTN = 'h-[26px] px-2.5 text-[11px]';

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
  /** Answers a member that stopped to ask the user for something (§22). */
  onTell: (body: string) => void;
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
  onTell,
  onClose,
}: RoomMemberPanelProps) {
  const [tab, setTab] = useState<MemberTab>('session');
  const [follow, setFollow] = useState(true);
  const [expanded, setExpanded] = useState(false);
  // The facts rail becomes a drawer below 1000px (F3 — toggled from the header).
  const [railOpen, setRailOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // The member's own turn count is what makes its history and its context
  // pressure change, so it is the signal both re-reads follow.
  const signal = `${member.usage.turns}:${member.session.compactionCount}:${member.status}`;
  const history = useMemberHistory(roomId, member.id, dispatch, signal);
  const context = useMemberContext(roomId, member.id, dispatch, signal);
  const turns = useMemo(() => toSessionTurns(history.entries), [history.entries]);
  const shown = expanded ? turns : turns.slice(-RECENT_TURNS);
  const folded = expanded ? [] : turns.slice(0, turns.length - shown.length);

  // Following the live turn is a scroll position, which only the DOM holds.
  useEffect(() => {
    if (follow && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [follow, live?.text, turns.length]);

  const jumpTo = (index: number) => {
    setExpanded(true);
    // The turn may only exist after the fold opens, so the scroll waits a frame.
    requestAnimationFrame(() => document.getElementById(`turn-${member.id}-${index}`)?.scrollIntoView({ block: 'start' }));
  };

  const liveNow = live?.toolInFlight
    ? `turn ${member.usage.turns} · ${live.toolInFlight.toolName} ${live.toolInFlight.summary} · running ${formatTimer(Date.now() - new Date(live.toolInFlight.startedAt).getTime())}`
    : live?.turnId
      ? `turn ${member.usage.turns} · thinking — no tool running`
      : member.statusDetail;

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 px-[18px] pt-[15px]">
        <div className="flex items-center gap-3">
          <Face seed={member.id} size={36} tone={member.isConductor ? 'conductor' : 'member'} label={memberGlyph(member.displayName, member.isConductor)} />
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-[-0.02em] text-room-text">{member.displayName}</h3>
            <p className="mt-1 truncate text-[11px] text-room-text4">
              {member.configuration.model} · {member.configuration.thinking}
              {member.session.lastOpenedAt && <> · started {formatClock(member.session.lastOpenedAt)}</>}
              {' · '}{member.usage.turns} {member.usage.turns === 1 ? 'turn' : 'turns'} · {formatCost(member.usage.costUsd)}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-[7px]">
            <Button variant="outline" className={SMALL_BTN} disabled={busy} onClick={onMessage}>
              Send a message
            </Button>
            {/* Blocked is included: waking it is the user saying "start it anyway". */}
            {(member.status === 'waiting' || member.status === 'idle' || member.status === 'blocked') && (
              <Button variant="outline" className={SMALL_BTN} disabled={busy} onClick={onWake}>
                Wake
              </Button>
            )}
            {/* F3: the facts rail collapses below 1000px; this reopens it. */}
            <Button
              variant="outline"
              aria-pressed={railOpen}
              className={cn(SMALL_BTN, 'hidden @max-[1000px]/panel:inline-flex')}
              onClick={() => setRailOpen((open) => !open)}
            >
              Facts
            </Button>
            <Button variant="ghost" size="icon" aria-label="Close" className="size-[26px] text-room-text3" onClick={onClose}>
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
        <div role="tablist" aria-label="Member detail" className="mt-3.5 flex gap-[3px] border-b border-room-line">
          {(Object.keys(MEMBER_TAB_LABEL) as MemberTab[]).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={tab === option}
              onClick={() => setTab(option)}
              className={cn(
                'flex h-8 items-center px-[13px] text-xs',
                tab === option
                  ? 'text-room-text shadow-[inset_0_-2px_0_var(--brand-primary)]'
                  : 'text-room-text4 hover:text-room-text3',
              )}
            >
              {MEMBER_TAB_LABEL[option]}
            </button>
          ))}
        </div>
      </div>

      {member.status === 'waiting' && (
        <WaitingStrip busy={busy} detail={member.statusDetail} onAnswer={onAnswer} onRelease={onRelease} />
      )}

      {member.status === 'blocked' && (
        <AttentionStrip busy={busy} detail={member.statusDetail} onTell={onTell} />
      )}

      {tab !== 'session' ? (
        <MemberTabPanel tab={tab} member={member} live={live} context={context} maxCostUsd={maxCostUsd} />
      ) : (
        <div role="tabpanel" aria-label={MEMBER_TAB_LABEL.session} className="relative flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center gap-[9px] border-b border-room-line bg-room-sunken px-[18px] py-2">
              <LivePill idle={!live?.turnId}>{live?.turnId ? 'Live' : member.status}</LivePill>
              <span className="room-tabular min-w-0 flex-1 truncate text-[10px] text-room-text2">{liveNow}</span>
              <FollowToggle on={follow} onToggle={() => setFollow(!follow)} />
            </div>

            <TurnStrip turns={turns} liveTurn={live?.turnId != null} onJump={jumpTo} />

            <div ref={scroller} className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-[18px] py-[15px]">
              {history.olderCursor && expanded && (
                <Button variant="outline" className={SMALL_BTN} disabled={history.loadingOlder} onClick={history.loadOlder}>
                  {history.loadingOlder ? 'Reading…' : 'Load earlier turns'}
                </Button>
              )}
              {folded.length > 0 && <CollapsedHistory turns={folded} onShow={() => setExpanded(true)} />}
              {turns.length === 0 && (
                <p className="text-xs text-room-text4">
                  {member.session.sessionId ? 'Reading this session…' : 'This member has not started yet.'}
                </p>
              )}
              {shown.map((turn) => (
                <TurnBlock key={turn.index} memberId={member.id} turn={turn} />
              ))}
              {/* Only mid-turn: the retained text outlives the turn, and the
                  finished turn arrives in the transcript above from the session
                  file itself. */}
              {live?.turnId && (live.text || live.toolInFlight) && (
                <LiveTurn text={live.text} tool={live.toolInFlight} turnIndex={member.usage.turns} />
              )}
            </div>
          </div>

          <MemberLiveRail member={member} live={live} context={context} className="hidden @min-[1000px]/panel:flex" />
          {railOpen && (
            <MemberLiveRail
              member={member}
              live={live}
              context={context}
              className="absolute inset-y-0 right-0 z-10 flex w-[300px] max-w-full bg-room-bg shadow-xl @min-[1000px]/panel:hidden"
            />
          )}
        </div>
      )}
    </div>
  );
}

/** The prototype's 30×17 Follow switch — a real toggle, not a button pair. */
function FollowToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onToggle} className="flex shrink-0 items-center gap-[7px] text-[11px] text-room-text3">
      <span className={cn('relative h-[17px] w-[30px] rounded-[9px]', on ? 'bg-brand-primary-subtle' : 'bg-room-muted')}>
        <span
          className={cn(
            'absolute top-0.5 size-[13px] rounded-full transition-[left]',
            on ? 'left-[15px] bg-brand-primary' : 'left-0.5 bg-room-text4',
          )}
        />
      </span>
      Follow
    </button>
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
    <div className="flex shrink-0 flex-col gap-2 border-b border-status-warning-border bg-status-warning-muted px-[18px] py-2.5">
      <p className="text-xs text-room-ink-warn">{detail}</p>
      <p className="text-[11px] leading-relaxed text-room-text4">
        Nothing is needed from you. This costs nothing: its turn ended and its slot went back to the team, and it
        starts again the moment the answer lands, in the same session, with everything it already knew.
      </p>
      {answering && (
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={2}
          autoFocus
          className="border-room-line-strong bg-room-sunken text-[13px] text-room-text2"
          placeholder="Answer in place of the member it asked…"
        />
      )}
      <div className="flex gap-2">
        {answering ? (
          <Button
            className={SMALL_BTN}
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
          <Button variant="outline" className={SMALL_BTN} disabled={busy} onClick={() => setAnswering(true)}>
            Answer it yourself
          </Button>
        )}
        <Button variant="ghost" className={cn(SMALL_BTN, 'text-room-text3')} disabled={busy} onClick={onRelease}>
          Cancel the question
        </Button>
      </div>
    </div>
  );
}

/**
 * A member that stopped to ask the USER something (`request-attention`, §22).
 *
 * Nobody else can answer it — a peer message cannot speak for the user — so the
 * panel has to say what it needs and take the answer here. Without this the
 * Room shows "needs you" and offers no way to be the user.
 */
function AttentionStrip({
  busy,
  detail,
  onTell,
}: {
  busy: boolean;
  detail: string;
  onTell: (body: string) => void;
}) {
  const [body, setBody] = useState('');

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-status-warning-border bg-status-warning-muted px-[18px] py-2.5">
      <p className="text-xs font-medium text-room-ink-warn">This member needs you</p>
      <p className="whitespace-pre-wrap text-xs text-room-text3">{detail}</p>
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={2}
        autoFocus
        className="border-room-line-strong bg-room-sunken text-[13px] text-room-text2"
        placeholder="Tell it what it needs to know…"
      />
      <div>
        <Button
          className={SMALL_BTN}
          disabled={busy || body.trim().length === 0}
          onClick={() => {
            onTell(body.trim());
            setBody('');
          }}
        >
          Send and continue
        </Button>
      </div>
    </div>
  );
}
