/**
 * Containment of a linked grant proposal in a stored delegation policy.
 *
 * One approval can cover the grants a project starts later, so the user is not
 * asked again for access they already approved. That only holds if the later
 * proposal is inside what was approved. This file is that check. It is pure:
 * it reads the CLAMPED proposal and the policy the HOST stored, and nothing a
 * plugin or an agent presents can widen either.
 *
 * A proposal that does not fit is not refused here. The caller falls back to
 * the per-grant approval, so the user decides the changed access.
 */

import type {
  PersistentSessionGrantProposal,
  PersistentSessionPermissionProfile,
  PersistentSessionSubjectPolicy,
} from '@sero-ai/common';

import { PERMISSION_ORDER, canonical, isInside } from './clamp';
import type { StoredDelegationPolicy } from './grant-store-types';

export type PolicyFit = { ok: true } | { ok: false; reason: string };

/** The stored policy a proposal names, and the app that presented it. */
export interface DelegationLink {
  policy: StoredDelegationPolicy;
  /** Caller identity from the host, never from a payload. */
  callerAppId: string;
}

const PROFILE_FIELDS = Object.keys(PERMISSION_ORDER) as (keyof PersistentSessionPermissionProfile)[];

function profileWithin(subject: PersistentSessionPermissionProfile, role: PersistentSessionPermissionProfile): boolean {
  return PROFILE_FIELDS.every((field) => {
    const order: readonly string[] = PERMISSION_ORDER[field];
    const asked = order.indexOf(subject[field]);
    // An unrecognised level never fits.
    return asked >= 0 && asked <= order.indexOf(role[field]);
  });
}

const subset = (asked: string[], allowed: string[]): boolean => asked.every((name) => allowed.includes(name));

/** Does one subject fit inside one role, field by field? */
export function subjectWithinRole(subject: PersistentSessionSubjectPolicy, role: PersistentSessionSubjectPolicy): boolean {
  const roots = role.allowedCwds.map(canonical);
  return subject.allowedCwds.every((cwd) => roots.some((root) => isInside(canonical(cwd), root)))
    && subset(subject.allowedModels, role.allowedModels)
    && subset(subject.allowedTools, role.allowedTools)
    && subset(subject.allowedSkills, role.allowedSkills)
    && subset(subject.allowedThinkingLevels, role.allowedThinkingLevels)
    && profileWithin(subject.permissionProfile, role.permissionProfile)
    && subject.maxSystemPromptAdditionBytes <= role.maxSystemPromptAdditionBytes;
}

/**
 * Does the clamped proposal fit inside the policy?
 *
 * Every subject must fit inside ONE role, whole. A subject is never checked
 * against the union of roles: a subject that reads with one role's tools and
 * writes with another's profile holds authority no role was approved for.
 */
export function fitsDelegationPolicy(proposal: PersistentSessionGrantProposal, link: DelegationLink): PolicyFit {
  const { policy, callerAppId } = link;
  if (policy.status !== 'active') return { ok: false, reason: 'the policy is revoked' };
  if (!policy.delegateAppIds.includes(callerAppId)) return { ok: false, reason: `app ${callerAppId} may not use this policy` };
  if (proposal.workspaceId !== policy.workspaceId) return { ok: false, reason: 'the proposal names another workspace' };

  const roles = Object.values(policy.roles);
  for (const [subject, subjectPolicy] of Object.entries(proposal.subjects)) {
    if (!roles.some((role) => subjectWithinRole(subjectPolicy, role))) {
      return { ok: false, reason: `subject ${subject} asks for more than any approved role` };
    }
  }

  if (proposal.maxLiveSessions > policy.maxLiveSessions) return { ok: false, reason: 'more live sessions than the policy allows' };
  if (proposal.maxTotalSessions > policy.maxTotalSessions - policy.createdSessions) {
    return { ok: false, reason: 'more sessions than the policy has left' };
  }
  return { ok: true };
}
