/**
 * The skills a NEW owner asks to be approved for. The host clamps the request
 * to what the user has enabled and the user approves it in the start dialog.
 * It widens only what is approved. The session still starts with no skill
 * loaded; the owner finds the rest with `tool_search`.
 *
 * Code Mode is not asked for. The host does not offer it to managed sessions
 * and gives a runtime no way to ask whether it does, so naming it would be a guess.
 */

import type { PersistentSessionGrantHandle, PersistentSessionGrantProposal } from '@sero-ai/common';

import type { ProjectRecord } from '../shared/record';
import type { ArchitectHost } from './host';

// Not imported from owner-session, which imports this module.
const OWNER_SUBJECT: ProjectRecord['session']['subject'] = 'owner';

/**
 * The workspace's enabled skills, for an owner that has no grant yet. An owner
 * that already has one asks again for exactly what was approved, including an
 * empty skill set, so a renewed grant neither widens nor drops it.
 */
export async function newOwnerSkills(host: Pick<ArchitectHost, 'listWorkerCapabilities'>, record: ProjectRecord): Promise<string[]> {
  if (record.session.grantId) return [...(record.session.grantedSkills ?? [])];
  if (!record.workspaceId) return [];
  return [...(await host.listWorkerCapabilities(record.workspaceId)).skills];
}

/** The same proposal with the owner's approved skill set widened. */
export function withOwnerSkills(proposal: PersistentSessionGrantProposal, skills: string[]): PersistentSessionGrantProposal {
  const owner = proposal.subjects[OWNER_SUBJECT];
  if (!owner || skills.length === 0) return proposal;
  return { ...proposal, subjects: { ...proposal.subjects, [OWNER_SUBJECT]: { ...owner, allowedSkills: skills } } };
}

/** What the host approved, as the record keeps it apart from what a turn loads. */
export function approvedOwnerSkills(handle: PersistentSessionGrantHandle): string[] {
  return [...(handle.subjects[OWNER_SUBJECT]?.allowedSkills ?? [])];
}
