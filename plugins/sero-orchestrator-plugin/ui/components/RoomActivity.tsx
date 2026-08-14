/**
 * The activity timeline (prototype screen 8, middle region).
 *
 * What HAS happened, newest first. It is an audit record, never a source of
 * state: the panel reads it, and nothing in the Room is derived from what is
 * shown here.
 *
 * The filters group the event kinds the way a user thinks about them, not the
 * way the record stores them — "messages" covers a question and its answer,
 * "work" covers work items, artifacts and claims.
 */

import { useMemo, useState } from 'react';
import { Button } from '@sero-ai/ui';
import type { RoomTimelineEvent } from '../../shared/room-message-types';
import { formatTime } from '../lib/format';

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

interface RoomActivityProps {
  events: RoomTimelineEvent[];
  /** Display names by member id, so a row can say who rather than which id. */
  names: Map<string, string>;
}

export function RoomActivity({ events, names }: RoomActivityProps) {
  const [filter, setFilter] = useState<Filter>('all');

  const shown = useMemo(
    () => (filter === 'all' ? events : events.filter((event) => FILTER_KINDS[filter].includes(event.kind))),
    [events, filter],
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <b className="text-sm">Activity</b>
        <div role="group" aria-label="Filter activity" className="ml-auto flex gap-1">
          {(Object.keys(FILTER_LABEL) as Filter[]).map((option) => (
            <Button
              key={option}
              size="sm"
              aria-pressed={filter === option}
              variant={filter === option ? 'secondary' : 'ghost'}
              onClick={() => setFilter(option)}
            >
              {FILTER_LABEL[option]}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-auto p-3">
        {shown.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {events.length === 0 ? 'Nothing has happened yet.' : 'Nothing of that kind yet.'}
          </p>
        )}
        {shown.map((event) => <ActivityRow key={event.id} event={event} names={names} />)}
      </div>
    </div>
  );
}

function ActivityRow({ event, names }: { event: RoomTimelineEvent; names: Map<string, string> }) {
  const who = event.memberId
    ? names.get(event.memberId) ?? event.memberId
    : SYSTEM_KINDS.includes(event.kind)
      ? 'Sero'
      : 'The Room';

  return (
    <div className="flex items-start gap-3">
      <span className="w-11 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{formatTime(event.at)}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <b className="font-medium">{who}</b> <span className="text-muted-foreground">{event.summary}</span>
        </p>
        {event.details?.ref && (
          <p className="truncate font-mono text-xs text-muted-foreground">{String(event.details.ref)}</p>
        )}
      </div>
    </div>
  );
}
