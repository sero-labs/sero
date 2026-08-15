/**
 * How a Room ended (prototype screen 16).
 *
 * The detail the delivered result only summarises: what came out of it, what
 * each member cost, and what was left undone and why. Cost is grouped by member
 * the same way the Usage app groups it, so the two never disagree.
 *
 * Nothing here is written for the occasion. Every figure is read from the Room
 * record, and the closing line is the one the Room itself recorded when it
 * finished.
 */

import type { PersistedRoom, RoomMember } from '../../shared/room-types';
import { artifactFileName, resolveArtifactPath } from '../lib/artifact-path';
import { formatCost, formatDuration, formatTime } from '../lib/format';
import { ROOM_STATUS_STYLE } from '../lib/status-style';
import { RoomArtifactLink } from './RoomArtifactLink';

interface RoomCompletionProps {
  room: PersistedRoom;
  members: Map<string, RoomMember>;
  /** The Room's own closing line, from the timeline. */
  finalLine: string | null;
  onOpenMember: (memberId: string) => void;
}

export function RoomCompletion({ room, members, finalLine, onOpenMember }: RoomCompletionProps) {
  const { runtime, definition, delivery, brief, artifacts } = room;
  const style = ROOM_STATUS_STYLE[runtime.status];
  const durationMs = runtime.startedAt && runtime.endedAt
    ? new Date(runtime.endedAt).getTime() - new Date(runtime.startedAt).getTime()
    : 0;
  const roster = room.memberIds.map((id) => members.get(id)).filter((member): member is RoomMember => !!member);
  const topCost = Math.max(...roster.map((member) => member.usage.costUsd), 0.01);
  const undone = [...brief.blockers, ...brief.openQuestions];

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-auto p-6">
      <div>
        <span className={`rounded-full border px-2 py-0.5 text-xs ${style.badge}`}>{style.label}</span>
        <h3 className="mt-2 text-base font-semibold">{definition.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{finalLine ?? brief.objective}</p>
      </div>

      <div className="flex flex-wrap gap-x-10 gap-y-4">
        <Stat label="Duration" value={formatDuration(durationMs)} of={formatDuration(definition.envelope.maxWallClockMs)} />
        <Stat label="Spend" value={formatCost(runtime.usage.costUsd)} of={formatCost(definition.envelope.maxCostUsd)} />
        <Stat label="Team" value={`${roster.length} member(s)`} of={`${runtime.usage.memberReplacements} replaced`} />
        <Stat label="Artifacts" value={`${artifacts.length}`} of={`${runtime.usage.turns} turn(s)`} />
      </div>

      <Panel title="Result">
        {delivery.deliveredAt ? (
          <p className="text-sm">
            Delivered to {delivery.destination} · {formatTime(delivery.deliveredAt)}
            {delivery.deliveryRef && <span className="block break-all font-mono text-xs text-muted-foreground">{delivery.deliveryRef}</span>}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            The work is finished. It was not delivered to {delivery.destination}, so nothing left Sero.
          </p>
        )}
      </Panel>

      <Panel title={`Artifacts · ${artifacts.length}`}>
        {artifacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing was published.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {artifacts.map((artifact) => (
              <RoomArtifactLink
                key={artifact.id}
                workspaceId={members.get(artifact.producedByMemberId)?.session.workspaceId ?? roster[0]?.session.workspaceId}
                path={resolveArtifactPath(artifact.ref, members.get(artifact.producedByMemberId))}
                className="rounded-md px-1 py-0.5 hover:bg-accent/40"
              >
                <span className="text-sm">{artifact.title}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {artifact.kind} · {members.get(artifact.producedByMemberId)?.displayName ?? artifact.producedByMemberId}
                </span>
                <span className="block font-mono text-xs text-muted-foreground transition-colors group-hover:text-room-text2">
                  {artifactFileName(artifact.ref)}
                </span>
              </RoomArtifactLink>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={`Cost by member · ${formatCost(runtime.usage.costUsd)}`}>
        {roster.map((member) => (
          <button
            key={member.id}
            type="button"
            onClick={() => onOpenMember(member.id)}
            className="flex items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-accent/40"
          >
            <span className="w-40 shrink-0 truncate text-sm">{member.displayName}</span>
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-emerald-500"
                style={{ width: `${(member.usage.costUsd / topCost) * 100}%` }}
              />
            </span>
            <span className="w-16 shrink-0 text-right text-xs tabular-nums">{formatCost(member.usage.costUsd)}</span>
          </button>
        ))}
      </Panel>

      {undone.length > 0 && (
        <Panel title={`Left undone · ${undone.length}`}>
          {undone.map((line) => <p key={line} className="text-sm">{line}</p>)}
        </Panel>
      )}
    </div>
  );
}

function Stat({ label, value, of }: { label: string; value: string; of: string }) {
  return (
    <span className="flex min-w-20 flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <b className="text-sm">{value}</b>
      <span className="text-xs text-muted-foreground">of {of}</span>
    </span>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-md border border-border p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </section>
  );
}
