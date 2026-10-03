/**
 * The `working` action: the owner records what it currently takes the work to
 * be, and revises it when it learns something. This is the owner's own
 * material. It changes no cap, no access and no approval, and it does not
 * touch the user's request, which stays verbatim in `idea` and `directives`.
 */

import { reopenSuperseded } from '../shared/evidence-binding';
import { appendHistory } from '../shared/lifecycle';
import type { OwnerActionInput, OwnerActionOutcome } from '../shared/owner-actions';
import type { ProjectRecord } from '../shared/record';
import { parseWorking } from '../shared/working-shape';
import { settleDelivery } from './delivery';
import { mutateRecord, type RecordStore } from './record-store';

export interface WorkingDeps {
  store: RecordStore;
}

export async function reviseWorking(deps: WorkingDeps, record: ProjectRecord, input: OwnerActionInput, now: string): Promise<OwnerActionOutcome & { record?: ProjectRecord }> {
  let note = '';
  const saved = await mutateRecord(deps.store, record.id, (fresh) => {
    // Parsed against the record on disk, so a criterion the user stated is
    // checked against the latest version and not the copy this turn began with.
    const parsed = parseWorking(input, fresh.working, now);
    if (!parsed.ok) return { error: parsed.error };
    const { working } = parsed;
    const changed = fresh.working !== undefined && working.revision !== fresh.working.revision;
    // Proof of a criterion that now reads differently is history. The
    // milestones it accepted go back to verifying; the rest keep their proof.
    const reopened = reopenSuperseded({ ...fresh, working });
    note = changed ? ` The criteria changed, so this is revision ${working.revision}.` : '';
    if (reopened.reopened.length > 0) note += ` Evidence for ${reopened.reopened.join(', ')} proved a criterion that changed, so ${reopened.reopened.length === 1 ? 'it needs' : 'they need'} a new evidence run. Other evidence still stands. This needs no approval.`;
    const cause = fresh.working ? 'Architect revised its approach' : 'Architect recorded its approach';
    // A gap stated here can be the last thing a waiting delivery needed.
    const delivery = settleDelivery(appendHistory(reopened.record, now, cause, undefined, working.reason ?? undefined), now);
    if (delivery.record.phase === 'maintain' && fresh.phase !== 'maintain') note += ' Every requirement the user stated is now accounted for, so the result is delivered.';
    return { record: delivery.record };
  });
  if (!saved.ok) return { ok: false, text: saved.error };
  const working = saved.record.working;
  return {
    ok: true,
    text: `Working interpretation saved at revision ${working?.revision ?? 1}.${note} It records your approach; it does not change the cap or the approved access.`,
    details: { revision: working?.revision ?? 1 },
    record: saved.record,
  };
}
