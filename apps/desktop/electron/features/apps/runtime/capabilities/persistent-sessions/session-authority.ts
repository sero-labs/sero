/**
 * Whether a session built from one reading of a grant may still be registered.
 *
 * `create` and `open` validate, build the session, then commit. An amendment
 * that lands between those steps can retire the subject or change its policy,
 * and a session built from the old reading would keep the removed authority.
 * Only a change to THIS subject counts: another subject's amendment is not a
 * conflict.
 */

import { isDeepStrictEqual } from 'util';

import type { PersistentSessionSubjectPolicy } from '@sero-ai/common';

import { retiredRefusal } from './grant-amendments';
import { isInsideDir, type StoredGrant } from './grant-store-types';

export function authorityConflict(
  grant: StoredGrant,
  subject: string,
  seen: PersistentSessionSubjectPolicy | undefined,
): 'subject-retired' | 'grant-changed' | null {
  const retired = retiredRefusal(grant, subject);
  if (retired) return retired;
  return seen && !isDeepStrictEqual(grant.subjects[subject], seen) ? 'grant-changed' : null;
}

/**
 * Why a built session may not be bound to its subject, or null. Besides a
 * revoked grant and a changed subject: Pi is given the grant's directory, so the
 * path should always be inside it, but a binding is permanent and a wrong one
 * would let `open` reach outside the grant forever. And two subjects sharing a
 * file would alias each other's session.
 */
export function commitFailure(
  grant: StoredGrant,
  reservation: StoredGrant['pending'][string],
  sessionPath: string,
): 'grant-revoked' | 'subject-retired' | 'grant-changed' | null {
  if (grant.status !== 'active') return 'grant-revoked';
  const conflict = authorityConflict(grant, reservation.subject, reservation.seenPolicy);
  if (conflict) return conflict;
  if (!isInsideDir(sessionPath, grant.sessionDir)) return 'grant-revoked';
  const shared = Object.entries(grant.sessionPaths)
    .some(([subject, bound]) => bound === sessionPath && subject !== reservation.subject);
  return shared ? 'grant-revoked' : null;
}
