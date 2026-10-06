/**
 * What a saved amendment is checked against right before the host is asked.
 *
 * The intent is saved first, so a request the Room can already see is unusable
 * is declined here, before the host changes anything. After the host has
 * committed there is no clean way back, so these checks are the only cheap one.
 * They use what the Room can know: the model, tool and skill catalogues, and the
 * roster and the other pending changes.
 */

import { flattenModelGroups, modelKey } from '@sero-ai/common';
import type { BlueprintMember } from '../../shared/room-blueprint-types';
import type { RoomRevisionProposal } from '../../shared/room-revision-types';
import { ROOM_SURFACE_TOOL } from '../../shared/room-surface';
import type { OrchestratorHost } from '../host';
import { planAmendableRevision } from './room-amend-plan';
import type { RoomRecord } from './room-state';

const KNOWN_THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

interface Requested {
  model?: string;
  thinking?: string;
  tools: string[];
  skills: string[];
}

function requestedBy(record: RoomRecord, proposal: RoomRevisionProposal): Requested | null {
  if (proposal.kind === 'change-configuration') {
    const member = record.members.find((candidate) => candidate.id === proposal.memberId);
    if (!member) return null;
    const { configuration: patch } = proposal;
    const current = member.configuration;
    // Only what the change adds is checked: a setup the member already holds stays valid.
    return {
      model: patch.model !== undefined && patch.model !== current.model ? patch.model : undefined,
      thinking: patch.thinking !== undefined && patch.thinking !== current.thinking ? patch.thinking : undefined,
      tools: (patch.tools ?? []).filter((tool) => !current.tools.includes(tool)),
      skills: (patch.skills ?? []).filter((skill) => !current.skills.includes(skill)),
    };
  }
  const joining: BlueprintMember | null = proposal.kind === 'add-member'
    ? proposal.member
    : proposal.kind === 'replace-member' ? proposal.replacement : null;
  return joining ? { model: joining.model, thinking: joining.thinking, tools: joining.tools, skills: joining.skills } : null;
}

/** A plain reason when the request names something this machine does not have, else null. */
async function catalogueProblem(host: OrchestratorHost, record: RoomRecord, proposal: RoomRevisionProposal): Promise<string | null> {
  const requested = requestedBy(record, proposal);
  if (!requested) return null;
  if (requested.thinking !== undefined && !KNOWN_THINKING_LEVELS.includes(requested.thinking)) {
    return `"${requested.thinking}" is not a thinking level.`;
  }
  if (requested.model !== undefined) {
    const models = flattenModelGroups(await host.listAvailableModels()).map((model) => modelKey(model.provider, model.modelId));
    if (!models.includes(requested.model)) return `The model ${requested.model} is not available here.`;
  }
  if (requested.tools.length > 0) {
    const names = new Set([ROOM_SURFACE_TOOL, ...(await host.listToolCatalog()).map((tool) => tool.name)]);
    const unknown = requested.tools.filter((tool) => !names.has(tool));
    if (unknown.length > 0) return `This workspace has no tool named ${unknown.join(', ')}.`;
  }
  if (requested.skills.length > 0) {
    const names = new Set((await host.listSkillCatalog()).map((skill) => skill.name));
    const unknown = requested.skills.filter((skill) => !names.has(skill));
    if (unknown.length > 0) return `This workspace has no skill named ${unknown.join(', ')}.`;
  }
  return null;
}

/**
 * Why a revision that has not reached the host can no longer go ahead, or null.
 * Roster changes are planned again against the Room as it is now, counting the
 * changes saved before this one, so two pending additions cannot both claim the
 * last place or the same key.
 */
export async function unattemptedProblem(host: OrchestratorHost, record: RoomRecord, revisionId: string): Promise<string | null> {
  const index = record.revisions.findIndex((revision) => revision.id === revisionId);
  const revision = record.revisions[index];
  const proposal = revision?.proposal;
  if (!revision || !proposal) return null;
  if (proposal.kind === 'change-configuration') {
    const member = record.members.find((candidate) => candidate.id === proposal.memberId);
    if (!member || member.status === 'retired') return 'The member this change was for has left the Room.';
  } else if (proposal.kind === 'add-member' || proposal.kind === 'replace-member') {
    // The change's own pending mark is not a reason to refuse it.
    const others = record.members.map((member) => member.configurationChange?.revisionId === revisionId
      ? { ...member, configurationChange: undefined }
      : member);
    const plan = planAmendableRevision({ ...record, members: others, revisions: record.revisions.slice(0, index) }, proposal, revision.actorMemberId ?? '');
    if (plan.verdict === 'refuse') return plan.reason;
  }
  return catalogueProblem(host, record, proposal);
}
