/**
 * Amending a grant that already exists.
 *
 * Every function here runs inside the grant store's serialized section (see
 * `GrantStore.amend`), so an amendment, a revocation and a reservation are
 * never interleaved. An amendment keeps the grant id, the session directory and
 * every subject binding. It only changes `subjects`, `retired` and `revision`.
 *
 * Containment: a changed or added subject is inside the approval when it fits
 * inside the subject's own stored policy (narrowing). A grant issued under a
 * delegation policy also admits a NEW subject that fits inside ONE role of that
 * policy (never the union), or any subject that fits the role it is named for.
 * An existing subject with no role of its name only narrows. Anything else is
 * an expansion and needs the user.
 */

import type {
  PersistentSessionGrantAmendment,
  PersistentSessionGrantAmendmentResult,
  PersistentSessionExpansion,
  PersistentSessionPermissionProfile,
  PersistentSessionSubjectPolicy,
} from '@sero-ai/common';

import { PERMISSION_ORDER, canonical, isInside } from './clamp';
import { subjectWithinRole } from './delegation-policy';
import type { StoredDelegationPolicy, StoredGrant } from './grant-store-types';

/** What the store hands an amendment while it holds the lock. */
export interface AmendTx {
  grant(grantId: string): StoredGrant | null;
  policy(policyId: string): StoredDelegationPolicy | null;
  persist(): Promise<void>;
}

/** An answer the caller settles on, or the expansion the user must be asked about. */
export type AmendStep = PersistentSessionGrantAmendmentResult | { ask: PersistentSessionExpansion[] };

const PROFILE_FIELDS = Object.keys(PERMISSION_ORDER) as (keyof PersistentSessionPermissionProfile)[];

/** Refusal for a subject that may start no more sessions, or null. */
export function retiredRefusal(grant: StoredGrant, subject: string): 'subject-retired' | null {
  return grant.retired?.includes(subject) ? 'subject-retired' : null;
}

/** Everything `next` holds that `current` (or nothing, for a new subject) does not. */
function addedAuthority(subject: string, next: PersistentSessionSubjectPolicy, current?: PersistentSessionSubjectPolicy): PersistentSessionExpansion[] {
  const out: PersistentSessionExpansion[] = [];
  const add = (field: PersistentSessionExpansion['field'], value: string) => out.push({ subject, field, value });
  if (!current) add('subject', subject);
  const roots = (current?.allowedCwds ?? []).map(canonical);
  for (const cwd of next.allowedCwds) if (!roots.some((root) => isInside(canonical(cwd), root))) add('cwd', cwd);
  const lists = [
    ['model', next.allowedModels, current?.allowedModels],
    ['tool', next.allowedTools, current?.allowedTools],
    ['skill', next.allowedSkills, current?.allowedSkills],
    ['thinking', next.allowedThinkingLevels, current?.allowedThinkingLevels],
  ] as const;
  for (const [field, wanted, held] of lists) for (const value of wanted) if (!held?.includes(value)) add(field, value);
  for (const field of PROFILE_FIELDS) {
    const order: readonly string[] = PERMISSION_ORDER[field];
    const had = current ? order.indexOf(current.permissionProfile[field]) : -1;
    const wants = order.indexOf(next.permissionProfile[field]);
    // A new subject lists only what it can actually do, not its "none" floor.
    if (wants > Math.max(had, current ? -1 : 0)) add('permission', `${field}: ${next.permissionProfile[field]}`);
  }
  if (next.maxSystemPromptAdditionBytes > (current?.maxSystemPromptAdditionBytes ?? 0) && current) {
    add('prompt', String(next.maxSystemPromptAdditionBytes));
  }
  return out;
}

/** The authority an amendment would add beyond what the grant already approves. */
export function expansionOf(
  tx: AmendTx,
  grant: StoredGrant,
  clamped: Record<string, PersistentSessionSubjectPolicy>,
): PersistentSessionExpansion[] {
  const policy = grant.delegatedBy ? tx.policy(grant.delegatedBy.policyId) : null;
  const out: PersistentSessionExpansion[] = [];
  for (const [subject, next] of Object.entries(clamped)) {
    const current = grant.subjects[subject];
    // Narrowing, or no change, is always inside the approval.
    if (current && subjectWithinRole(next, current)) continue;
    // A subject named for a role is held to that role. Otherwise it may fit ONE
    // role, whole: it never borrows read from one role and write from another,
    // and an existing read-only subject does not gain write because some other
    // role has it (that case is only reached for a NEW subject, above).
    const named = policy?.roles[subject];
    const roles = named ? [named] : current ? [] : Object.values(policy?.roles ?? {});
    if (roles.some((role) => subjectWithinRole(next, role))) continue;
    out.push(...addedAuthority(subject, next, current));
  }
  return out;
}

/**
 * Decides one amendment under the lock. `answer` is undefined on the first
 * pass; after the user was asked it is their reply, and the same checks run
 * again, because the grant can change while a dialog is open.
 */
export async function settleAmendment(
  tx: AmendTx,
  appId: string,
  amendment: PersistentSessionGrantAmendment,
  clamped: Record<string, PersistentSessionSubjectPolicy>,
  answer?: boolean,
): Promise<AmendStep> {
  const { grantId, amendmentId } = amendment;
  const refused = (reason: string, revision: number | null): AmendStep =>
    ({ status: 'refused', amendmentId, revision, reason });
  const grant = tx.grant(grantId);
  if (!grant || grant.appId !== appId) return refused('the grant is unknown', null);
  const revision = grant.revision ?? 0;
  // Idempotency comes first: a caller that lost the answer asks again.
  const stored = grant.amendments?.[amendmentId];
  if (stored) return stored;
  if (grant.status !== 'active') return refused('the grant is revoked', revision);
  if (grant.delegatedBy && tx.policy(grant.delegatedBy.policyId)?.status !== 'active') {
    return refused('the approval this grant ran under was revoked', revision);
  }
  if (amendment.expectedRevision !== revision) return { status: 'stale', amendmentId, revision };

  const retire = [...new Set(amendment.retire ?? [])];
  const changed = Object.keys(clamped);
  if (changed.length === 0 && retire.length === 0) return refused('the amendment changes nothing', revision);
  const unknown = retire.find((subject) => !grant.subjects[subject]);
  if (unknown) return refused(`cannot retire ${unknown}: it is not in this grant`, revision);
  const frozen = [...changed, ...retire].find((subject) => retiredRefusal(grant, subject) && changed.includes(subject));
  if (frozen) return refused(`${frozen} is retired and cannot be changed`, revision);
  if (retire.some((subject) => changed.includes(subject))) return refused('a subject cannot be changed and retired together', revision);

  const expansion = expansionOf(tx, grant, clamped);
  if (expansion.length > 0 && answer === undefined) {
    return amendment.approval === 'ask' ? { ask: expansion } : { status: 'needs-approval', amendmentId, revision, expansion };
  }

  const before = { subjects: grant.subjects, retired: grant.retired, revision: grant.revision, amendments: grant.amendments };
  if (expansion.length > 0 && !answer) {
    const declined: PersistentSessionGrantAmendmentResult = { status: 'declined', amendmentId, revision };
    grant.amendments = { ...grant.amendments, [amendmentId]: declined };
    return commit(tx, grant, before, declined);
  }
  grant.subjects = { ...grant.subjects, ...structuredClone(clamped) };
  grant.retired = [...new Set([...(grant.retired ?? []), ...retire])];
  grant.revision = revision + 1;
  const applied: PersistentSessionGrantAmendmentResult = {
    status: 'applied',
    amendmentId,
    revision: grant.revision,
    subjects: structuredClone(grant.subjects),
    retired: [...grant.retired],
    approvedByUser: expansion.length > 0,
  };
  grant.amendments = { ...grant.amendments, [amendmentId]: applied };
  return commit(tx, grant, before, applied);
}

/** Writes the grant; a failed write leaves the in-memory grant as it was. */
async function commit(
  tx: AmendTx,
  grant: StoredGrant,
  before: Pick<StoredGrant, 'subjects' | 'retired' | 'revision' | 'amendments'>,
  result: PersistentSessionGrantAmendmentResult,
): Promise<AmendStep> {
  try {
    await tx.persist();
  } catch (error) {
    Object.assign(grant, before);
    throw error;
  }
  return result;
}
