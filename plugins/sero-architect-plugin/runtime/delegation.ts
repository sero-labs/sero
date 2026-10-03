/**
 * The access a project asks to pass on to the work it starts.
 *
 * The user approves a project's start once. That approval carries a delegation:
 * the roles a Room member may hold and how many sessions the project may run.
 * The host clamps it, shows it and stores it. A Room the Architect starts later
 * names the stored policy, and the host issues its grant without another dialog
 * when every member fits inside one role.
 *
 * Nothing here is authority. It is a proposal: the host drops every name it
 * cannot resolve and caps every level, and it checks later grants against its
 * own stored copy, never against the project record.
 */

import { modelKey, type PersistentSessionDelegationProposal, type PersistentSessionPermissionProfile, type PersistentSessionSubjectPolicy } from '@sero-ai/common';

import { resolveEffectiveTiers } from '../shared/model-config';
import type { ProjectRecord } from '../shared/record';
import type { ArchitectHost } from './host';
import { projectModelSource } from './model-resolution';

/** The app that starts Rooms for a project. The host admits bundled apps only. */
const DELEGATE_APP_IDS = ['orchestrator'];

/**
 * Two roles, because a Room member is one of two things: it reads, or it edits
 * in its own working copy. A member must fit inside ONE role whole, so a
 * reading member never borrows the editing role's shell. Neither role may push:
 * publishing to a remote keeps its own approval.
 */
const ROLE_PROFILES: Record<string, PersistentSessionPermissionProfile> = {
  reader: { filesystem: 'read', commands: 'readOnly', network: 'fetch', vcs: 'read' },
  editor: { filesystem: 'write', commands: 'all', network: 'fetch', vcs: 'commit' },
};

/** The bridge every Room member holds to talk to its own Room. */
const MEMBER_BRIDGE_TOOL = 'sero-cli';

/** Asked high on purpose: the host caps each of these at its own maximum. */
const SESSION_BOUNDS = { maxLiveSessions: 8, maxTotalSessions: 64, maxSystemPromptAdditionBytes: 16_384 };

type DelegationHost = Pick<ArchitectHost, 'modelTiers' | 'listWorkerCapabilities'>;

export async function delegationProposal(host: DelegationHost, record: ProjectRecord): Promise<PersistentSessionDelegationProposal> {
  if (!record.workspaceId) throw new Error(`project ${record.id} has no workspace yet`);
  const [tiers, capabilities] = await Promise.all([host.modelTiers(), host.listWorkerCapabilities(record.workspaceId)]);
  const entries = resolveEffectiveTiers(projectModelSource(record, tiers)).map((tier) => tier.entry);
  const base: Omit<PersistentSessionSubjectPolicy, 'permissionProfile'> = {
    // Worktrees a member edits in are made inside the project folder.
    allowedCwds: [record.folder],
    allowedModels: [...new Set(entries.map((entry) => modelKey(entry.provider, entry.modelId)))],
    allowedThinkingLevels: [...new Set(entries.map((entry) => entry.thinkingLevel ?? 'medium'))],
    // Every name the workspace offers. The host removes the ones a role's
    // profile does not permit, so the stored reader role holds no write tool.
    allowedTools: [...new Set([...capabilities.tools, MEMBER_BRIDGE_TOOL])],
    allowedSkills: capabilities.skills,
    maxSystemPromptAdditionBytes: SESSION_BOUNDS.maxSystemPromptAdditionBytes,
  };
  return {
    delegateAppIds: DELEGATE_APP_IDS,
    roles: Object.fromEntries(Object.entries(ROLE_PROFILES).map(([role, permissionProfile]) => [role, { ...base, permissionProfile }])),
    maxLiveSessions: SESSION_BOUNDS.maxLiveSessions,
    maxTotalSessions: SESSION_BOUNDS.maxTotalSessions,
  };
}
