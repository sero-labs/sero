/**
 * One amendment, end to end: clamp, decide under the store's lock, ask the user
 * outside it when asked to, then decide again under the lock.
 */

import type { PersistentSessionGrantAmendment, PersistentSessionGrantAmendmentResult } from '@sero-ai/common';

import { amendmentFingerprint } from './amendment-fingerprint';
import { settleAmendment, storedAnswer } from './grant-amendments';
import type { PersistentSessionHostDeps } from './host';

export async function runAmendment(
  deps: Pick<PersistentSessionHostDeps, 'appId' | 'grantStore' | 'clampSubjects' | 'approveExpansion'>,
  amendment: PersistentSessionGrantAmendment,
): Promise<PersistentSessionGrantAmendmentResult> {
  const { appId, grantStore } = deps;
  const refused = (reason: string): PersistentSessionGrantAmendmentResult =>
    ({ status: 'refused', amendmentId: amendment.amendmentId, revision: null, reason });
  const grant = grantStore.get(amendment.grantId);
  if (!grant || grant.appId !== appId) return refused('the grant is unknown');
  // A repeat is answered from the stored result even when clamping would now differ.
  const stored = storedAnswer(grant, amendment);
  if (stored) return stored;
  const clamped = await deps.clampSubjects(grant.workspaceId, amendment.subjects ?? {});
  if (!clamped) return refused('the workspace of this grant is not available');

  const first = await grantStore.amend((tx) => settleAmendment(tx, appId, amendment, clamped));
  if (!('ask' in first)) return first;
  // The dialog runs outside the store's lock. The answer is then settled under
  // the lock again, so a revocation or another amendment that landed meanwhile wins.
  const answer = await deps.approveExpansion(String(amendment.reason ?? '').slice(0, 500), first.ask)
    .catch(() => false);
  const second = await grantStore.amend((tx) => settleAmendment(tx, appId, amendment, clamped, answer));
  return 'ask' in second ? refused('the grant changed while approval was asked') : second;
}

/** One run per grant and amendment id: a repeat that arrives mid-dialog shares the answer. */
export type AmendmentsInFlight = Map<string, { fingerprint: string; run: Promise<PersistentSessionGrantAmendmentResult> }>;

export async function runAmendmentOnce(
  inFlight: AmendmentsInFlight,
  deps: Parameters<typeof runAmendment>[0],
  input: PersistentSessionGrantAmendment,
): Promise<PersistentSessionGrantAmendmentResult> {
  const amendment = structuredClone(input);
  const key = `${amendment.grantId}:${amendment.amendmentId}`;
  const fingerprint = amendmentFingerprint(amendment);
  const running = inFlight.get(key);
  if (running) {
    if (running.fingerprint === fingerprint) return running.run;
    return {
      status: 'refused',
      amendmentId: amendment.amendmentId,
      revision: null,
      reason: 'this amendment id is already in use for a different change',
    };
  }
  const run = runAmendment(deps, amendment).finally(() => inFlight.delete(key));
  inFlight.set(key, { fingerprint, run });
  return run;
}
