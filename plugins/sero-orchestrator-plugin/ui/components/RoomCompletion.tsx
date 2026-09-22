/**
 * How a Room ended (prototype screen 16, frame 3).
 *
 * The result, then the plan the Room produced, open at its first section, then
 * the artifacts it also published, then what it cost. The title and the status
 * belong to the top bar and the duration and spend to the header, so this view
 * does not repeat them — what is left is what the Room made, where it went and
 * what it cost, which is what the user came for.
 */

import { Fragment, useEffect } from 'react';
import type { RoomArtifact } from '../../shared/room-message-types';
import type { PersistedRoom, RoomMember } from '../../shared/room-types';
import { artifactFileName, resolveArtifactPath } from '../lib/artifact-path';
import { splitArtifactDocument, partKeys } from '../lib/artifact-document';
import { formatCost } from '../lib/format';
import { deliveredLine, otherArtifacts, pickPlan, resultLine } from '../lib/room-result';
import { useRoomArtifact } from '../lib/use-room-artifact';
import { ArtifactProse } from './ArtifactProse';
import { WorkspaceFileLink } from './WorkspaceFileLink';

interface RoomCompletionProps {
  room: PersistedRoom;
  members: Map<string, RoomMember>;
  /** The Room's own closing line, from the timeline. */
  finalLine: string | null;
  onOpenMember: (memberId: string) => void;
}

/** A fold with the drawing's chevron and summary, used for sections and cards. */
function Fold({ title, hint, defaultOpen = false, children }: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-[12.5px] text-room-text2 hover:text-room-text">
        <span aria-hidden className="text-room-text4 transition-transform group-open:rotate-90">›</span>
        <span className="min-w-0">{title}</span>
        {hint && <span className="ml-auto shrink-0 font-mono text-[11.5px] text-room-text3">{hint}</span>}
      </summary>
      {children}
    </details>
  );
}

/**
 * The plan the Room produced, read in place.
 *
 * The card's title is the artifact's OWN recorded title, not the first heading
 * of the file: the file's heading names the subject, and this names the
 * artifact. The file's heading is still shown, so nothing is dropped.
 */
function PlanCard({ room, artifact, author, workspaceId }: {
  room: PersistedRoom;
  artifact: RoomArtifact;
  author: RoomMember | undefined;
  workspaceId: string | undefined;
}) {
  const { reads, read } = useRoomArtifact(room.definition.id);
  const state = reads[artifact.id];

  // Read when the card appears, not on every render. A Room's artifacts are
  // bounded, and the plan is the one the user came to read.
  useEffect(() => { read(artifact.id); }, [artifact.id, read]);

  const document = state?.status === 'ready' ? splitArtifactDocument(state.content) : null;
  // A document can repeat a heading, so each section is named by its own text
  // plus how many identical ones came before — not by its position.
  const sectionKeys = partKeys(document?.sections.map((section) => section.heading) ?? []);
  const path = resolveArtifactPath(artifact.ref, author);

  return (
    <section className="flex flex-col gap-1 rounded-[10px] border border-room-line bg-room-surface px-4 py-3">
      <div className="flex items-center gap-2.5">
        <b className="min-w-0 text-[13.5px] text-room-text">{artifact.title}</b>
        <span className="shrink-0 text-[11.5px] text-room-text3">
          {artifact.kind} · {author?.displayName ?? artifact.producedByMemberId}
        </span>
        <WorkspaceFileLink
          workspaceId={workspaceId}
          path={path}
          className="ml-auto shrink-0 rounded border border-room-line px-2 py-0.5 text-[11.5px] text-room-text2 hover:border-room-line-strong hover:text-room-text"
        >
          Open file
        </WorkspaceFileLink>
      </div>

      {state?.status === 'unreadable' && (
        // The artifact is named and attributed; only its content is missing.
        <p className="text-[12.5px] text-room-text3">{state.reason}</p>
      )}
      {state?.status === 'loading' && <p className="text-[12.5px] text-room-text3">Reading the plan…</p>}

      {document?.title && (
        <p className="text-[12.5px] text-room-text3">{document.title}</p>
      )}
      {document && document.sections.length === 0 && <ArtifactProse lines={document.intro} />}
      {document && document.sections.length > 0 && (
        <div className="mt-1 flex flex-col">
          {document.intro.length > 0 && <ArtifactProse lines={document.intro} />}
          {document.sections.map((section, at) => (
            <Fold key={sectionKeys[at]} title={section.heading} defaultOpen={at === 0}>
              <div className="pb-2">
                <ArtifactProse lines={section.lines} />
              </div>
            </Fold>
          ))}
        </div>
      )}
    </section>
  );
}

/** What the Room published besides its plan, as compact rows. */
function ArtifactRows({ artifacts, members, workspaceId }: {
  artifacts: RoomArtifact[];
  members: Map<string, RoomMember>;
  workspaceId: string | undefined;
}) {
  return (
    <div className="flex flex-col">
      {artifacts.map((artifact) => {
        const author = members.get(artifact.producedByMemberId);
        return (
          <div
            key={artifact.id}
            className="flex items-center gap-2.5 border-b border-room-line py-2 last:border-b-0"
          >
            <b className="min-w-0 text-[12.5px] text-room-text">{artifact.title}</b>
            <span className="shrink-0 text-[11.5px] text-room-text3">
              {artifact.kind} · {author?.displayName ?? artifact.producedByMemberId}
            </span>
            <WorkspaceFileLink
              workspaceId={workspaceId}
              path={resolveArtifactPath(artifact.ref, author)}
              className="ml-auto shrink-0 rounded border border-room-line px-2 py-0.5 text-[11.5px] text-room-text2 hover:border-room-line-strong hover:text-room-text"
            >
              Open
            </WorkspaceFileLink>
            {!workspaceId && <span className="shrink-0 font-mono text-[11px] text-room-text4">{artifactFileName(artifact.ref)}</span>}
          </div>
        );
      })}
    </div>
  );
}

export function RoomCompletion({ room, members, finalLine, onOpenMember }: RoomCompletionProps) {
  const plan = pickPlan(room, members);
  const others = otherArtifacts(room, plan);
  const result = resultLine(finalLine, plan);
  const delivered = deliveredLine(room);
  const roster = room.memberIds.map((id) => members.get(id)).filter((member): member is RoomMember => member !== undefined);
  const undone = [...room.brief.blockers, ...room.brief.openQuestions];
  // Artifacts live in the Room's workspace, so the author's own session names it.
  const workspaceId = plan
    ? members.get(plan.producedByMemberId)?.session.workspaceId ?? roster[0]?.session.workspaceId
    : roster[0]?.session.workspaceId;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-auto p-6">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
        <dt className="text-[12.5px] text-room-text3">Result</dt>
        <dd className="text-[13px] text-room-text">{result ?? room.brief.objective}</dd>
        <dt className="text-[12.5px] text-room-text3">Delivered</dt>
        <dd className="text-[12.5px] text-room-text2">
          {delivered.text}
          {delivered.ref && <code className="block break-all font-mono text-[11px] text-room-text3">{delivered.ref}</code>}
        </dd>
      </dl>

      {plan && <PlanCard room={room} artifact={plan} author={members.get(plan.producedByMemberId)} workspaceId={workspaceId} />}
      {others.length > 0 && (
        <ArtifactRows artifacts={others} members={members} workspaceId={workspaceId} />
      )}

      <Fold title="Cost by member" hint={formatCost(room.runtime.usage.costUsd)}>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 py-1.5 text-[12.5px]">
          {roster.map((member) => (
            <Fragment key={member.id}>
              <dt className="min-w-0 text-room-text2">
                <button
                  type="button"
                  onClick={() => onOpenMember(member.id)}
                  className="cursor-pointer text-left underline decoration-room-text4 decoration-dotted underline-offset-2 hover:decoration-solid"
                >
                  {member.displayName}
                </button>
              </dt>
              <dd className="text-right font-mono text-room-text2">{formatCost(member.usage.costUsd)}</dd>
            </Fragment>
          ))}
        </dl>
      </Fold>

      {undone.length > 0 && (
        <Fold title={`Left undone · ${undone.length}`}>
          <div className="flex flex-col gap-1 pb-2">
            {undone.map((line) => <p key={line} className="m-0 text-[12.5px] text-room-text2">{line}</p>)}
          </div>
        </Fold>
      )}
    </div>
  );
}
