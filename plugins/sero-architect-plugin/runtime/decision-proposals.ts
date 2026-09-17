/**
 * What the user's `apply` means for each forced escalation. Split from the
 * management actions to keep that file within the 500-LOC limit.
 */

import type { DispatchDestination } from '../shared/owner-actions';
import { mayDispatch, setCap, settle } from '../shared/lifecycle';
import type { DecisionProposal, ProjectRecord } from '../shared/record';
import { performDispatch } from './dispatch-link';
import type { OwnerServices } from './owner-actions';
import type { RecordStore } from './record-store';

interface ProposalDeps {
  store: RecordStore;
  services: OwnerServices;
}

/** Applies a charter-change proposal the user accepted. Their acceptance is the approval. */
function applyCharterProposal(record: ProjectRecord, proposal: Extract<DecisionProposal, { kind: 'charter' }>, now: string): ProjectRecord {
  const existing = new Map(record.milestones.map((milestone) => [milestone.id, milestone]));
  const proposed = proposal.milestones.map((milestone) => {
    const current = existing.get(milestone.id);
    if (!current) return milestone;
    return {
      ...milestone,
      status: current.status,
      dispatch: current.dispatch,
      pendingDispatch: current.pendingDispatch,
      evidence: current.evidence,
      verification: current.verification,
      parkedBy: current.parkedBy,
      parkedFrom: current.parkedFrom,
      parkedByDecisions: current.parkedByDecisions,
      receipt: current.receipt,
    };
  });
  const proposedIds = new Set(proposed.map((milestone) => milestone.id));
  const retained = record.milestones.filter((milestone) =>
    !proposedIds.has(milestone.id) && (milestone.dispatch !== null || milestone.pendingDispatch !== undefined || milestone.status === 'running' || milestone.status === 'verifying' || milestone.status === 'done'),
  );
  const milestones = [...proposed, ...retained];
  const charter = { ...proposal.charter, milestoneIds: milestones.map((milestone) => milestone.id), approvedAt: now };

  return {
    ...record,
    charter,
    milestones,
    autonomy: charter.autonomy,
    budget: { ...record.budget, capUsd: charter.capUsd },
  };
}

/**
 * What the user's `apply` means for each forced escalation. Nothing here runs
 * on `keep`. It runs after the answer is written, never inside the store's
 * write queue, because a dispatch calls out to the Orchestrator and then
 * writes the link itself.
 */
export async function applyDecisionProposal(deps: ProposalDeps, record: ProjectRecord, proposal: DecisionProposal, now: string): Promise<ProjectRecord> {
  switch (proposal.kind) {
    case 'charter':
      return (await deps.store.update(record.id, (fresh) => settle(applyCharterProposal(fresh, proposal, now), now))) ?? record;
    case 'cap':
      return (await deps.store.update(record.id, (fresh) => {
        const raised = setCap(fresh, proposal.capUsd, now);
        return raised.ok ? raised.record : null;
      })) ?? record;
    case 'dispatch': {
      const current = await deps.store.read(record.id);
      if (!current) throw new Error(`No project ${record.id}.`);
      if (!mayDispatch(current)) throw new Error(current.overlay ? `The project is ${current.overlay}; no new dispatch may start.` : `The project is in ${current.phase}; no dispatch may start.`);
      const milestone = current.milestones.find((m) => m.id === proposal.milestoneId);
      if (!milestone || milestone.status === 'parked' || milestone.status === 'running' || milestone.status === 'verifying' || milestone.status === 'done') {
        throw new Error(`Milestone ${proposal.milestoneId} is not available for dispatch.`);
      }
      if (milestone.status === 'planned' && current.autonomy === 'milestones') throw new Error(`Milestone ${milestone.id} still needs plan approval.`);
      const { record: dispatched } = await performDispatch(deps.store, deps.services, current, milestone, {
        kind: proposal.dispatchKind, prompt: proposal.prompt, destination: proposal.destination as DispatchDestination, maxCostUsd: null,
      }, now);
      return dispatched;
    }
    case 'research-access':
      // Answered by its own options, never by `apply`.
      return record;
  }
}
