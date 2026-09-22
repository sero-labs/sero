/**
 * The activity timeline (prototype screen 8, middle region).
 *
 * What HAS happened, newest first. It is an audit record, never a source of
 * state: the panel reads it, and nothing in the Room is derived from what is
 * shown here.
 *
 * Each row is the 44px mono timestamp, the actor's face and the sentence with
 * the actor in bold. Findings, approvals and roster revisions are promoted
 * into tinted EventCards — the difference between the prototype's timeline
 * and a log dump.
 */

import { useMemo, useState } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { RoomTimelineEvent } from '../../shared/room-message-types';
import type { RoomMember } from '../../shared/room-types';
import { artifactFileName, resolveArtifactPath } from '../lib/artifact-path';
import { formatClock } from '../lib/format';
import { memberGlyph } from '../lib/member-glyph';
import { EventCard, Face, type EventCardTone } from './room-kit';
import { RoomArtifactLink } from './RoomArtifactLink';

type Filter = 'highlights' | 'all' | 'decisions' | 'messages' | 'work';

const FILTER_KINDS: Record<Exclude<Filter, 'all' | 'highlights'>, readonly RoomTimelineEvent['kind'][]> = {
  decisions: ['revision', 'approval', 'room-status', 'delivery', 'limit'],
  messages: ['message'],
  work: ['work', 'artifact', 'claim'],
};

const FILTER_LABEL: Record<Filter, string> = {
  highlights: 'Highlights',
  all: 'All',
  decisions: 'Decisions',
  messages: 'Messages',
  work: 'Work',
};

function isHighlight(event: RoomTimelineEvent): boolean {
  if (event.kind === 'session' || event.kind === 'compaction' || event.kind === 'claim') return false;
  return event.kind !== 'member-status' || event.details?.status !== 'completed';
}

/** Kinds the Room did to itself rather than a member doing them. */
const SYSTEM_KINDS: readonly RoomTimelineEvent['kind'][] = ['session', 'compaction', 'recovery', 'limit'];

/** Kinds weighty enough to promote into a tinted card. */
const PROMOTED_TONE: Partial<Record<RoomTimelineEvent['kind'], EventCardTone>> = {
  artifact: 'ok',
  approval: 'warn',
  revision: 'revision',
  limit: 'warn',
};

interface RoomActivityProps {
  events: RoomTimelineEvent[];
  members: Map<string, RoomMember>;
  /**
   * Events the Room record says it has appended. When none of them arrive, the
   * activity could not be read rather than never having happened: a Room with
   * ninety-nine saved events read "Nothing has happened yet." with the Rooms
   * runtime off.
   */
  savedEvents?: number;
}

export function RoomActivity({ events, members, savedEvents = 0 }: RoomActivityProps) {
  const [filter, setFilter] = useState<Filter>('highlights');

  // The counts and the shown rows come from one pass over the events, so a
  // filter can never show a number its own list disagrees with.
  const { shown, counts } = useMemo(() => {
    const select = (option: Exclude<Filter, 'all' | 'highlights'>) => events.filter((event) => FILTER_KINDS[option].includes(event.kind));
    const counts: Record<Filter, number> = {
      highlights: events.filter(isHighlight).length,
      all: events.length,
      decisions: select('decisions').length,
      messages: select('messages').length,
      work: select('work').length,
    };
    const shown = filter === 'highlights' ? events.filter(isHighlight)
      : filter === 'all' ? events
      : select(filter);
    return { shown, counts };
  }, [events, filter]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden px-[18px] py-[15px]">
      <div className="mb-3 flex items-center">
        <b className="text-xs font-semibold text-room-text2">Activity</b>
        <div role="group" aria-label="Filter activity" className="ml-auto flex gap-[6px]">
          {(Object.keys(FILTER_LABEL) as Filter[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
              className={cn(
                // An inactive pill is outlined with a transparent background; only
                // the active one is filled, as the drawing sets it.
                'flex items-center rounded-full border px-[10px] py-[4px] text-[12px]',
                filter === option
                  ? 'border-room-line-strong bg-room-overlay text-room-text'
                  : 'border-room-line bg-transparent text-room-text3 hover:text-room-text2',
              )}
            >
              {FILTER_LABEL[option]}
              {/* The count is its own element, never part of the label. */}
              <i className="ml-[3px] font-mono text-[10px] not-italic text-room-text3">{counts[option]}</i>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 && (
          <p className="text-xs text-room-text4">
            {events.length > 0
              ? 'Nothing of that kind yet.'
              : savedEvents > 0
                ? `Activity is not available now. Its ${savedEvents} events are saved.`
                : 'Nothing has happened yet.'}
          </p>
        )}
        {shown.map((event) => <ActivityRow key={event.id} event={event} members={members} />)}
      </div>
    </div>
  );
}

/**
 * Everything one row reads off a single event, derived in one place so the row
 * below is only the assembly of its parts.
 */
interface ActivityRowParts {
  member: RoomMember | null;
  system: boolean;
  who: string;
  tone: EventCardTone | undefined;
  artifactRef: string | null;
  refText: string | null;
  sentence: string;
  workspaceId: string | undefined;
}

function activityRowParts(event: RoomTimelineEvent, members: Map<string, RoomMember>): ActivityRowParts {
  const member = event.memberId ? members.get(event.memberId) ?? null : null;
  const system = !event.memberId && SYSTEM_KINDS.includes(event.kind);
  const who = member?.displayName ?? event.memberId ?? (system ? 'Sero' : 'The Room');
  // The event's own reference, whether or not it was promoted into a card.
  const refText = event.details?.ref != null ? String(event.details.ref) : null;
  return {
    member,
    system,
    who,
    tone: PROMOTED_TONE[event.kind],
    artifactRef: event.kind === 'artifact' ? refText : null,
    refText,
    // The summary opens with the actor's name; the bold prefix must not repeat it.
    sentence: event.summary.startsWith(who) ? event.summary.slice(who.length).trimStart() : event.summary,
    workspaceId: member?.session.workspaceId ?? members.values().next().value?.session.workspaceId,
  };
}

/** The member's face, or the Room's own mark for something the Room did itself. */
function ActivityAvatar({ event, member, who, system }: {
  event: RoomTimelineEvent;
  member: RoomMember | null;
  who: string;
  system: boolean;
}) {
  if (!member && system) {
    return (
      <span aria-hidden className="grid size-[22px] shrink-0 place-items-center rounded-[6px] bg-room-muted text-[9px] text-room-text3">
        ◷
      </span>
    );
  }
  return (
    <Face seed={member?.id ?? event.memberId ?? who} size={22} tone={member?.isConductor ? 'conductor' : 'member'} label={memberGlyph(who, member?.isConductor)} />
  );
}

/**
 * A weighty event as the card itself, not a sentence plus a card: the record
 * carries one summary, and saying it twice is noise. A published artifact
 * names what was published and offers one control that opens it.
 */
function PromotedEvent({ event, parts, tone }: { event: RoomTimelineEvent; parts: ActivityRowParts; tone: EventCardTone }) {
  return (
    <EventCard
      tone={tone}
      title={<span className="min-w-0">{event.summary}</span>}
      actions={parts.artifactRef ? (
        <RoomArtifactLink
          workspaceId={parts.workspaceId}
          path={resolveArtifactPath(parts.artifactRef, parts.member ?? undefined)}
          title={artifactFileName(parts.artifactRef)}
          className="text-[11px] font-semibold text-room-ink-brand hover:underline"
        >
          Open
        </RoomArtifactLink>
      ) : undefined}
    >
      {!parts.artifactRef && parts.refText != null ? (
        <span className="room-tabular text-room-text3">{parts.refText}</span>
      ) : null}
    </EventCard>
  );
}

/** An ordinary event: the actor and the sentence, then its reference if it has one. */
function ActivitySentence({ who, sentence, refText }: { who: string; sentence: string; refText: string | null }) {
  return (
    <>
      <p className="text-xs leading-[1.55] text-room-text3">
        <b className="font-medium text-room-text2">{who}</b> {sentence}
      </p>
      {refText != null && (
        <p className="room-tabular mt-[5px] truncate text-[11px] text-room-text4">{refText}</p>
      )}
    </>
  );
}

function ActivityRow({ event, members }: { event: RoomTimelineEvent; members: Map<string, RoomMember> }) {
  const parts = activityRowParts(event, members);
  return (
    <div className="flex gap-[11px] border-b border-room-line py-2.5 last:border-b-0">
      <span className="room-tabular w-11 shrink-0 pt-0.5 text-[9px] text-room-text4">{formatClock(event.at)}</span>
      <ActivityAvatar event={event} member={parts.member} who={parts.who} system={parts.system} />
      <div className="min-w-0 flex-1">
        {parts.tone ? (
          <PromotedEvent event={event} parts={parts} tone={parts.tone} />
        ) : (
          <ActivitySentence who={parts.who} sentence={parts.sentence} refText={parts.refText} />
        )}
      </div>
    </div>
  );
}
