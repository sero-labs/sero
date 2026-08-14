/**
 * The artifact commands: publish one, list them, read one back.
 *
 * They live apart from the router only to keep that file inside the size limit;
 * the router still owns authority and idempotency, and calls in here with a
 * caller it has already checked.
 *
 * Why reading matters: members work in separate checkouts, so one member cannot
 * open the file another changed. A published artifact is the one thing the whole
 * Room shares. A live Room proved the point — the writer published its work, the
 * Conductor could not read it, and the two argued about a README neither could
 * show the other until the Room ran out of time.
 */

import type { RoomArtifactKind } from '../../shared/room-message-types';
import type { OrchestratorHost } from '../host';
import type { RoomRecord } from './room-state';
import type { RoomWork } from './room-work';
import { renderArtifact, renderArtifactList } from './room-command-text';

export interface ArtifactCommandInput {
  artifactKind?: RoomArtifactKind;
  /** read-artifact only: which published artifact to read. */
  artifactId?: string;
  title?: string;
  body?: string;
  ref?: string;
  relatedWorkId?: string;
}

export interface ArtifactCommandOutcome {
  ok: boolean;
  text: string;
  details: Record<string, unknown>;
}

export interface ArtifactCommandDeps {
  host: Pick<OrchestratorHost, 'readArtifact'>;
  work: RoomWork;
  noteStructuralProgress(roomId: string, summary: string, recordEvent?: boolean): Promise<void>;
}

const ok = (text: string, details: Record<string, unknown> = {}): ArtifactCommandOutcome => ({ ok: true, text, details });
const no = (text: string, details: Record<string, unknown> = {}): ArtifactCommandOutcome => ({ ok: false, text, details });

export async function publishArtifactCommand(
  deps: ArtifactCommandDeps,
  record: RoomRecord,
  memberId: string,
  input: ArtifactCommandInput,
  commandId: string,
): Promise<ArtifactCommandOutcome> {
  if (!input.artifactKind) return no('Say what kind of artifact this is (plan, decision, commit, review, report, …).');
  const roomId = record.definition.id;
  const member = record.members.find((candidate) => candidate.id === memberId);
  const result = await deps.work.publishArtifact(
    roomId,
    memberId,
    {
      kind: input.artifactKind,
      title: input.title ?? '',
      content: input.body || undefined,
      ref: input.ref,
      relatedWorkId: input.relatedWorkId,
    },
    commandId,
  );
  if (!result.ok) {
    return result.code === 'duplicate' ? ok(result.message, { duplicate: true }) : no(result.message, { code: result.code });
  }
  await deps.noteStructuralProgress(
    roomId,
    `${member?.displayName ?? memberId} published ${result.artifact.kind}: ${result.artifact.title}.`,
  );
  return ok(renderArtifact(result.artifact), { artifactId: result.artifact.id, ref: result.artifact.ref });
}

export async function showArtifactsCommand(
  deps: ArtifactCommandDeps,
  record: RoomRecord,
): Promise<ArtifactCommandOutcome> {
  const artifacts = await deps.work.listArtifacts(record.definition.id);
  const names = new Map(record.members.map((member) => [member.id, member.displayName]));
  return ok(renderArtifactList(artifacts, names), { artifactIds: artifacts.map((artifact) => artifact.id) });
}

export async function readArtifactCommand(
  deps: ArtifactCommandDeps,
  record: RoomRecord,
  input: ArtifactCommandInput,
): Promise<ArtifactCommandOutcome> {
  const wanted = input.artifactId?.trim() || input.ref?.trim();
  if (!wanted) return no('Name the artifact to read (its id from show-artifacts).');
  const artifacts = await deps.work.listArtifacts(record.definition.id);
  const artifact = artifacts.find((candidate) => candidate.id === wanted || candidate.ref === wanted);
  if (!artifact) return no(`There is no artifact ${wanted} in this Room.`);
  const content = await deps.host.readArtifact(artifact.ref);
  // An artifact can name an external reference (a URL, a commit) that this
  // process cannot open. Saying so is the answer; inventing the content is not.
  if (content === null) return no(`Artifact ${artifact.id} points at ${artifact.ref}, which cannot be read from here.`);
  return ok(`${artifact.kind} "${artifact.title}":\n\n${content}`, { artifactId: artifact.id, ref: artifact.ref });
}
