/**
 * The Room brief, work, claims and artifacts (prototype screen 8, right region).
 *
 * The brief is BUILT by the coordinator from Room records after structural
 * progress. It is not a summary of the transcript, and no member ever reads the
 * whole Room history. The Conductor's note is labelled as its own, because it is
 * the one part a member wrote and it cannot change any computed field.
 */

import { useState } from 'react';
import { Button } from '@sero-ai/ui';
import type { PathClaim, RoomRevision } from '../../shared/room-message-types';
import type { PersistedRoom } from '../../shared/room-types';
import { formatRelative } from '../lib/format';
import { claimOverlaps } from '../lib/room-view';
import { useStateDir } from '../lib/use-orchestrator-index';
import { useWatchedJson } from '../lib/use-watched-json';

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

export function RoomSidePanel({ room, names }: { room: PersistedRoom; names: Map<string, string> }) {
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
    <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-l border-border">
      <div role="tablist" aria-label="Room detail" className="flex gap-1 border-b border-border px-2 py-2">
        {(Object.keys(TAB_LABEL) as Tab[]).map((option) => (
          <Button
            key={option}
            size="sm"
            role="tab"
            aria-selected={tab === option}
            variant={tab === option ? 'secondary' : 'ghost'}
            onClick={() => setTab(option)}
          >
            {TAB_LABEL[option]}
          </Button>
        ))}
      </div>

      <div role="tabpanel" aria-label={TAB_LABEL[tab]} className="flex flex-1 flex-col gap-3 overflow-auto p-3">
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
              <p className="text-xs leading-relaxed text-muted-foreground">
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
              : [...revisions].reverse().map((revision) => (
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
    <div className="flex flex-col gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/[0.06] p-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {overlaps.length} overlap(s)
      </p>
      {overlaps.map((overlap) => (
        <p key={`${overlap.members.join()}:${overlap.patterns.join()}`} className="text-sm">
          {who(overlap.members[0])} and {who(overlap.members[1])} both claimed{' '}
          <span className="font-mono text-xs">{overlap.patterns[0]}</span>
          {overlap.patterns[0] !== overlap.patterns[1] && (
            <> and <span className="font-mono text-xs">{overlap.patterns[1]}</span></>
          )}.
        </p>
      ))}
      <p className="text-xs leading-relaxed text-muted-foreground">
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
    <div className="flex flex-col gap-1.5 rounded-md border border-border p-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Roster changes</p>
      <p className="text-sm">
        {usage.rosterRevisions} used of {envelope.maxRosterRevisions} allowed. Replacements count separately:{' '}
        {usage.memberReplacements} of {envelope.maxMemberReplacements}.
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
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
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Room brief · {formatRelative(brief.updatedAt)}
        </p>
        <p className="mt-1 text-sm">{brief.objective}</p>
      </div>
      <Field label="Decided" lines={brief.decisions} />
      <Field label="Active work" lines={brief.activeWork} />
      <Field label="Blocked" lines={brief.blockers} />
      <Field label="Open questions" lines={brief.openQuestions} />
      <Field label="Success criteria" lines={brief.successCriteria} />

      {brief.conductorNote && (
        <div className="rounded-md border border-border p-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Conductor's note · {formatRelative(brief.conductorNoteAt ?? brief.updatedAt)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{brief.conductorNote}</p>
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        The brief is built from Room records, not from the transcript. Each member is given only the part
        that concerns its own work.
      </p>
    </>
  );
}

function Field({ label, lines }: { label: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <ul className="mt-0.5 flex flex-col gap-0.5">
        {lines.map((line) => <li key={line} className="text-sm">{line}</li>)}
      </ul>
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function Entry({ title, note, children }: { title: string; note: string; children?: string | null }) {
  return (
    <div className="rounded-md border border-border p-2.5">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
      {children && <p className="mt-1 break-words text-xs text-muted-foreground">{children}</p>}
    </div>
  );
}
