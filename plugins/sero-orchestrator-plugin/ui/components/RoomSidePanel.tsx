/**
 * The Room brief, work, claims and artifacts (prototype screen 8, right region).
 *
 * The brief is BUILT by the coordinator from Room records after structural
 * progress. It is not a summary of the transcript, and no member ever reads the
 * whole Room history. The Conductor's note is labelled as its own, because it is
 * the one part a member wrote and it cannot change any computed field.
 */

import { useState } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { PathClaim, RoomRevision } from '../../shared/room-message-types';
import type { PersistedRoom } from '../../shared/room-types';
import { formatRelative } from '../lib/format';
import { claimOverlaps } from '../lib/room-view';
import { useStateDir } from '../lib/use-orchestrator-index';
import { useWatchedJson } from '../lib/use-watched-json';
import { Eyebrow, NoteBlock } from './room-kit';

type Tab = 'brief' | 'work' | 'claims' | 'artifacts' | 'changes';

const TAB_LABEL: Record<Tab, string> = {
  brief: 'Brief',
  work: 'Work',
  claims: 'Claims',
  artifacts: 'Artifacts',
  changes: 'Changes',
};

/** What a revision DID, in the user's terms rather than the record's. */
const OUTCOME_LABEL: Record<RoomRevision['outcome'], string> = {
  applied: 'applied',
  'awaiting-approval': 'waiting for you',
  rejected: 'you rejected it',
  refused: 'refused — outside the envelope',
  withdrawn: 'withdrawn',
};

interface RoomSidePanelProps {
  room: PersistedRoom;
  names: Map<string, string>;
  className?: string;
}

export function RoomSidePanel({ room, names, className }: RoomSidePanelProps) {
  const [tab, setTab] = useState<Tab>('brief');
  const stateDir = useStateDir();
  // Revisions have their own file, so the changes tab follows it directly.
  const revisions = useWatchedJson<RoomRevision[]>(
    stateDir ? `${stateDir}/rooms/${room.definition.id}/revisions.json` : null,
    [],
  );
  const who = (memberId: string | null) => (memberId ? names.get(memberId) ?? memberId : 'nobody');
  // A released claim is history; the panel answers "what is claimed now".
  const active = room.claims.filter((claim) => claim.status === 'active');

  return (
    <aside className={cn('flex w-80 shrink-0 flex-col overflow-hidden border-l border-room-line bg-room-sunken', className)}>
      <div role="tablist" aria-label="Room detail" className="flex h-9 shrink-0 border-b border-room-line px-2.5">
        {(Object.keys(TAB_LABEL) as Tab[]).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={tab === option}
            onClick={() => setTab(option)}
            className={cn(
              'grid flex-1 place-items-center text-[11px]',
              tab === option
                ? 'text-room-text2 shadow-[inset_0_-1px_0_var(--brand-primary)]'
                : 'text-room-text4 hover:text-room-text3',
            )}
          >
            {TAB_LABEL[option]}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={TAB_LABEL[tab]} className="flex flex-1 flex-col gap-3 overflow-y-auto p-3.5">
        {tab === 'brief' && <Brief room={room} />}

        {tab === 'work' && (room.work.length === 0
          ? <Empty>No work recorded yet.</Empty>
          : room.work.map((item) => (
              <Entry key={item.id} title={item.title} note={`${item.status} · ${who(item.ownerMemberId)}`}>
                {item.notes}
              </Entry>
            )))}

        {tab === 'claims' && (active.length === 0
          ? <Empty>No paths are claimed.</Empty>
          : (
            <>
              <ClaimOverlaps room={room} claims={active} who={who} />
              {active.map((claim) => (
                <Entry key={claim.id} title={claim.pattern} note={`${who(claim.memberId)} · ${formatRelative(claim.createdAt)}`}>
                  {claim.reason}
                </Entry>
              ))}
              <p className="text-[10px] leading-[1.55] text-room-text4">
                Claims are advice between members. They are not a lock and they never replace Git — separate
                checkouts are what actually stop two members overwriting each other. They are released when a
                member retires or the Room ends.
              </p>
            </>
          ))}

        {tab === 'changes' && (
          <>
            <RosterBudget room={room} />
            {revisions.length === 0
              ? <Empty>The team has not changed since it started.</Empty>
              : revisions.toReversed().map((revision) => (
                  <Entry
                    key={revision.id}
                    title={revision.summary}
                    note={`${revision.actorMemberId ? who(revision.actorMemberId) : 'You'} · ${OUTCOME_LABEL[revision.outcome]} · ${formatRelative(revision.createdAt)}`}
                  >
                    {revision.rejectionReason ?? revision.reason}
                  </Entry>
                ))}
          </>
        )}

        {tab === 'artifacts' && (room.artifacts.length === 0
          ? <Empty>Nothing published yet.</Empty>
          : room.artifacts.map((artifact) => (
              <Entry key={artifact.id} title={artifact.title} note={`${artifact.kind} · ${who(artifact.producedByMemberId)}`}>
                {artifact.ref}
              </Entry>
            )))}
      </div>
    </aside>
  );
}

/**
 * Who is about to edit the same file as somebody else.
 *
 * The overlap itself is not a fault — it is the thing the user has to know
 * before the two branches meet. The line says which safety boundary is actually
 * holding, because a claim is not one.
 */
function ClaimOverlaps({
  room,
  claims,
  who,
}: {
  room: PersistedRoom;
  claims: PathClaim[];
  who: (memberId: string) => string;
}) {
  const overlaps = claimOverlaps(claims);
  if (overlaps.length === 0) return null;
  const separate = room.definition.envelope.workspacePolicy.mode === 'worktree-per-member';

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-status-warning-border bg-status-warning-muted p-3">
      <Eyebrow>{overlaps.length} overlap(s)</Eyebrow>
      {overlaps.map((overlap) => (
        <p key={`${overlap.members.join()}:${overlap.patterns.join()}`} className="text-[11px] leading-relaxed text-room-text3">
          {who(overlap.members[0])} and {who(overlap.members[1])} both claimed{' '}
          <span className="room-tabular text-room-text3">{overlap.patterns[0]}</span>
          {overlap.patterns[0] !== overlap.patterns[1] && (
            <> and <span className="room-tabular text-room-text3">{overlap.patterns[1]}</span></>
          )}.
        </p>
      ))}
      <p className="text-[10px] leading-[1.55] text-room-text4">
        {separate
          ? 'They work in separate checkouts, so neither can overwrite the other — but both will change the same file, and one of them has to merge.'
          : 'They share one working tree, so the later write wins. The Conductor has to give one of them the work.'}
      </p>
    </div>
  );
}

/**
 * How much the Conductor may still change, and where its authority stops.
 *
 * Both figures are counted by the runtime against the envelope the user
 * approved. The second paragraph is the boundary itself: everything it lists is
 * refused in runtime code, so the user is reading a rule rather than a promise.
 */
function RosterBudget({ room }: { room: PersistedRoom }) {
  const { usage } = room.runtime;
  const { envelope } = room.definition;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-room-line bg-room-surface p-3">
      <Eyebrow>Roster changes</Eyebrow>
      <p className="text-[11px] leading-relaxed text-room-text3">
        {usage.rosterRevisions} used of {envelope.maxRosterRevisions} allowed. Replacements count separately:{' '}
        {usage.memberReplacements} of {envelope.maxMemberReplacements}.
      </p>
      <p className="text-[10px] leading-[1.55] text-room-text4">
        The Conductor can add, retire, suspend and resume members, change a mandate, reassign work and pick another
        model you approved. More access, more spend, more time, a bigger team, a new delivery destination — and
        replacing itself — always come to you.
      </p>
    </div>
  );
}

function Brief({ room }: { room: PersistedRoom }) {
  const { brief } = room;
  return (
    <>
      <div className="rounded-lg border border-room-line bg-room-surface p-3">
        <Eyebrow tone="brand" className="mb-2">Room brief · {formatRelative(brief.updatedAt)}</Eyebrow>
        <p className="text-[11px] leading-[1.6] text-room-text3">{brief.objective}</p>
        <BriefField label="Decided" lines={brief.decisions} />
        <BriefField label="Active work" lines={brief.activeWork} />
        <BriefField label="Blocked" lines={brief.blockers} />
        <BriefField label="Open questions" lines={brief.openQuestions} />
        <BriefField label="Success criteria" lines={brief.successCriteria} />
      </div>

      {brief.conductorNote && (
        <NoteBlock tone="brand" title={<>Conductor's note · {formatRelative(brief.conductorNoteAt ?? brief.updatedAt)}</>}>
          {brief.conductorNote}
        </NoteBlock>
      )}

      <p className="text-[10px] leading-[1.55] text-room-text4">
        The brief is built from Room records, not from the transcript. Each member is given only the part
        that concerns its own work.
      </p>
    </>
  );
}

function BriefField({ label, lines }: { label: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-[9px] border-t border-room-line pt-[9px]">
      <small className="room-mono-micro block uppercase tracking-[0.07em] text-room-text4">{label}</small>
      <ul className="mt-[5px] flex flex-col gap-1">
        {lines.map((line) => <li key={line} className="text-[11px] leading-[1.55] text-room-text3">{line}</li>)}
      </ul>
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="text-[11px] text-room-text4">{children}</p>;
}

function Entry({ title, note, children }: { title: string; note: string; children?: string | null }) {
  return (
    <div className="rounded-lg border border-room-line bg-room-surface p-3">
      <p className="text-[11px] font-medium text-room-text2">{title}</p>
      <p className="mt-0.5 text-[10px] text-room-text4">{note}</p>
      {children && <p className="mt-1.5 break-words text-[11px] leading-relaxed text-room-text4">{children}</p>}
    </div>
  );
}
