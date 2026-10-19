/**
 * The skills a NEW owner asks to be approved for. The host clamps the request
 * to what the user has enabled and the user approves it in the start dialog.
 * It widens only what is approved. The session still starts with no skill
 * loaded; the owner finds the rest with `tool_search`.
 *
 * Code Mode (`codemode`) is asked for the same way, by a NEW owner only, and
 * only when the tool catalogue offers it. It joins the approved tools, not the
 * initial loadout: the host loads an approved Code Mode on its own.
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

/** Pi's Code Mode. A script can call only the tools the session was approved for. */
export const CODEMODE_TOOL = 'codemode';

/**
 * The tools an owner asks to be approved for. An owner that already has a grant
 * asks again for exactly what it had, so a renewed grant neither adds Code Mode
 * nor drops it. A new owner adds it when the catalogue lists it. The catalogue
 * is the only signal: it is what the host offers a managed session, and the
 * host drops a name it cannot resolve anyway.
 */
export async function ownerGrantTools(host: Pick<ArchitectHost, 'listWorkerCapabilities'>, record: ProjectRecord, base: readonly string[]): Promise<string[]> {
  if (record.session.grantId) return [...(record.session.grantedTools ?? base)];
  if (!record.workspaceId) return [...base];
  const offered = (await host.listWorkerCapabilities(record.workspaceId)).tools;
  return offered.includes(CODEMODE_TOOL) ? [...base, CODEMODE_TOOL] : [...base];
}

/** The same proposal with the owner's approved tool list replaced. */
export function withOwnerTools(proposal: PersistentSessionGrantProposal, tools: string[]): PersistentSessionGrantProposal {
  const owner = proposal.subjects[OWNER_SUBJECT];
  if (!owner) return proposal;
  return { ...proposal, subjects: { ...proposal.subjects, [OWNER_SUBJECT]: { ...owner, allowedTools: tools } } };
}
