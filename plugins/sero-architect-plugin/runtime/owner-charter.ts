/**
 * The charter action of the deprecated charter flow. A project made before
 * delivery agreements proposes a charter in discovery and waits for the user to
 * approve it. A project with an agreement never does: its start approval is its
 * authority, and this action refuses it.
 */

import { hasAgreement } from '../shared/agreement';
import { parseCharter, toMilestone } from '../shared/charter-shape';
import { toDecision } from '../shared/decision-shape';
import { advancePhase, appendHistory } from '../shared/lifecycle';
import type { OwnerActionInput, OwnerActionOutcome } from '../shared/owner-actions';
import type { Charter, ProjectRecord } from '../shared/record';
import type { ArchitectHost } from './host';
import { mutateRecord, type RecordStore } from './record-store';
import type { TurnOutcomes } from './turn-outcomes';

export interface CharterDeps {
  host: Pick<ArchitectHost, 'newId'>;
  store: RecordStore;
  outcomes: TurnOutcomes;
}

const ok = (text: string, details: Record<string, unknown> = {}): OwnerActionOutcome => ({ ok: true, text, details });
const refuse = (text: string): OwnerActionOutcome => ({ ok: false, text });

export async function proposeCharter(deps: CharterDeps, record: ProjectRecord, input: OwnerActionInput, now: string): Promise<OwnerActionOutcome> {
  const { host, store, outcomes } = deps;
  if (hasAgreement(record)) {
    return refuse('This project runs under a delivery agreement, so it has no charter to propose. The start is already approved: record your approach with the working action, then add a milestone and dispatch it.');
  }
  const parsed = parseCharter(input);
  if (!parsed.ok) return refuse(parsed.error);
  const { draft } = parsed;
  const milestones = draft.milestones.map((m, index) => toMilestone(m, `m${index + 1}`));
  const proposed: Charter = {
    milestoneIds: milestones.map((m) => m.id),
    escalationPolicy: draft.escalationPolicy,
    autonomy: draft.autonomy,
    capUsd: draft.capUsd,
    proposedAt: now,
    approvedAt: null,
  };
  if (record.charter?.approvedAt) {
    // Forced escalation: an approved charter changes only by a user decision.
    const decision = toDecision(
      {
        question: 'The owner proposes a change to the approved charter. Apply it?',
        options: [
          { id: 'apply', label: 'Apply the new charter', consequence: `The charter changes to ${milestones.length} milestone(s) with a $${draft.capUsd} cap and autonomy "${draft.autonomy}".` },
          { id: 'keep', label: 'Keep the current charter', consequence: 'Nothing changes; the owner continues under the approved charter.' },
        ],
        recommendation: 'apply',
        reason: 'the owner asked to change an approved charter',
        dependsOn: [],
      },
      host.newId('dec'),
      now,
      { kind: 'charter', charter: proposed, milestones },
    );
    await store.update(record.id, (fresh) => appendHistory({ ...fresh, decisions: [...fresh.decisions, decision] }, now, `decision ${decision.id} raised: charter change proposed`));
    outcomes.declare(record.id, 'decide');
    return ok(`The charter is already approved, so the change is recorded as decision ${decision.id} for the user to answer. Nothing was applied.`, { decisionId: decision.id });
  }
  if (record.phase !== 'discovery' && record.phase !== 'charter') {
    return refuse(`A charter is proposed during discovery, and the project is in ${record.phase}.`);
  }
  const applied = await mutateRecord(store, record.id, (fresh) => {
    const proposal: ProjectRecord = { ...fresh, charter: proposed, milestones, stateLine: 'Charter proposed. Waiting for your approval.' };
    if (proposal.phase !== 'discovery') return { record: appendHistory(proposal, now, 'the owner proposed a revised charter') };
    const advanced = advancePhase(proposal, 'charter', now, 'the owner proposed the charter');
    return advanced.ok ? { record: advanced.record } : { error: advanced.error };
  });
  if (!applied.ok) return refuse(applied.error);
  return ok(`Charter proposed with ${milestones.length} milestone(s) and a $${draft.capUsd} cap. The user must approve it before any work starts; call sleep.`, {
    milestoneIds: proposed.milestoneIds,
  });
}
