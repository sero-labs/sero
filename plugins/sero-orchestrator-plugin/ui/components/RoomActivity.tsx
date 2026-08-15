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

type Filter = 'all' | 'decisions' | 'messages' | 'work';

const FILTER_KINDS: Record<Exclude<Filter, 'all'>, readonly RoomTimelineEvent['kind'][]> = {
  decisions: ['revision', 'approval', 'room-status', 'delivery', 'limit'],
  messages: ['message'],
  work: ['work', 'artifact', 'claim'],
};

const FILTER_LABEL: Record<Filter, string> = {
  all: 'All',
  decisions: 'Decisions',
  messages: 'Messages',
  work: 'Work',
};

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
}

export function RoomActivity({ events, members }: RoomActivityProps) {
  const [filter, setFilter] = useState<Filter>('all');

  const shown = useMemo(
    () => (filter === 'all' ? events : events.filter((event) => FILTER_KINDS[filter].includes(event.kind))),
    [events, filter],
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden px-[18px] py-[15px]">
      <div className="mb-3 flex items-center">
        <b className="text-xs font-semibold text-room-text2">Activity</b>
        <div role="group" aria-label="Filter activity" className="ml-auto flex gap-[5px]">
          {(Object.keys(FILTER_LABEL) as Filter[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
              className={cn(
                'flex h-[21px] items-center rounded-[11px] px-2 text-[10px]',
                filter === option
                  ? 'bg-brand-primary-subtle text-room-ink-brand'
                  : 'bg-room-muted text-room-text3 hover:text-room-text2',
              )}
            >
              {FILTER_LABEL[option]}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 && (
          <p className="text-xs text-room-text4">
            {events.length === 0 ? 'Nothing has happened yet.' : 'Nothing of that kind yet.'}
          </p>
        )}
        {shown.map((event) => <ActivityRow key={event.id} event={event} members={members} />)}
      </div>
    </div>
  );
}

function ActivityRow({ event, members }: { event: RoomTimelineEvent; members: Map<string, RoomMember> }) {
  const member = event.memberId ? members.get(event.memberId) ?? null : null;
  const system = !event.memberId && SYSTEM_KINDS.includes(event.kind);
  const who = member?.displayName ?? event.memberId ?? (system ? 'Sero' : 'The Room');
  const tone = PROMOTED_TONE[event.kind];
  const artifactRef = event.kind === 'artifact' && event.details?.ref != null ? String(event.details.ref) : null;
  const workspaceId = member?.session.workspaceId ?? members.values().next().value?.session.workspaceId;
  // The summary opens with the actor's name; the bold prefix must not repeat it.
  const sentence = event.summary.startsWith(who) ? event.summary.slice(who.length).trimStart() : event.summary;

  return (
    <div className="flex gap-[11px] border-b border-room-line py-2.5 last:border-b-0">
      <span className="room-tabular w-11 shrink-0 pt-0.5 text-[9px] text-room-text4">{formatClock(event.at)}</span>
      {member || !system ? (
        <Face seed={member?.id ?? event.memberId ?? who} size={22} tone={member?.isConductor ? 'conductor' : 'member'} label={memberGlyph(who, member?.isConductor)} />
      ) : (
        <span aria-hidden className="grid size-[22px] shrink-0 place-items-center rounded-[6px] bg-room-muted text-[9px] text-room-text3">
          ◷
        </span>
      )}
      <div className="min-w-0 flex-1">
        {tone ? (
          // The weighty kinds are the card itself, not a sentence plus a card:
          // the record carries one summary, and saying it twice is noise.
          <EventCard tone={tone} title={<span className="min-w-0">{event.summary}</span>}>
            {artifactRef ? (
              <RoomArtifactLink workspaceId={workspaceId} path={resolveArtifactPath(artifactRef, member ?? undefined)} className="room-tabular break-all text-room-text3 hover:text-room-text2">
                {artifactFileName(artifactRef)}
              </RoomArtifactLink>
            ) : event.details?.ref != null ? (
              <span className="room-tabular text-room-text3">{String(event.details.ref)}</span>
            ) : null}
          </EventCard>
        ) : (
          <>
            <p className="text-xs leading-[1.55] text-room-text3">
              <b className="font-medium text-room-text2">{who}</b> {sentence}
            </p>
            {event.details?.ref != null && (
              <p className="room-tabular mt-[5px] truncate text-[11px] text-room-text4">{String(event.details.ref)}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
