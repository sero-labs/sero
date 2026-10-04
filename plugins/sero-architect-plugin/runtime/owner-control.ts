/**
 * The `control` action: the owner pauses, resumes, retries or cancels work it
 * started. It reaches a Room or Workflow only through the project's own
 * milestone and research ids. Recovery inside the approved limits runs at once.
 * More working time or a larger cap is the user's to give, so it becomes a
 * decision and nothing is changed until they answer.
 */

import type { OwnerActionInput, OwnerActionOutcome } from '../shared/owner-actions';
import type { DecisionProposal, ProjectRecord } from '../shared/record';
import { CONTROL_OPERATIONS, controlLinkedWork, type ControlOperation, type LinkedWorkDeps, type NeededApproval } from './linked-work';

/** Records a decision for the user and ends the wake. Supplied by the owner actions. */
export type RaiseDecision = (
  draft: { question: string; options: { id: string; label: string; consequence: string }[]; reason: string; proposal: DecisionProposal },
  lead: string,
) => Promise<OwnerActionOutcome>;

const isControl = (value: string | undefined): value is ControlOperation => (CONTROL_OPERATIONS as readonly string[]).includes(value ?? '');

function approvalDraft(needed: NeededApproval): Parameters<RaiseDecision>[0] {
  if (needed.kind === 'room-time') {
    return {
      question: `The Room for "${needed.label}" used its ${needed.currentMinutes} min working-time limit. Allow ${needed.maxMinutes} min in total?`,
      options: [
        { id: 'apply', label: `Allow ${needed.maxMinutes} min in total`, consequence: 'The same Room continues with its work. Its spending limit does not change.' },
        { id: 'keep', label: 'Keep the limit', consequence: 'The Room stays stopped with its work saved. The Architect plans the rest another way.' },
      ],
      reason: 'the Room needs more working time than was approved',
      proposal: { kind: 'room-time', target: needed.target, maxMinutes: needed.maxMinutes },
    };
  }
  return {
    question: `The Workflow for "${needed.label}" stopped at its $${needed.currentUsd} cap. Allow $${needed.maxCostUsd} in total?`,
    options: [
      { id: 'apply', label: `Allow $${needed.maxCostUsd} in total`, consequence: 'The same Workflow continues from where it stopped, inside the project cap.' },
      { id: 'keep', label: 'Keep the cap', consequence: 'The Workflow stays stopped with its work saved. The Architect plans the rest another way.' },
    ],
    reason: 'the Workflow needs a larger cap than was approved',
    proposal: { kind: 'workflow-budget', milestoneId: needed.milestoneId, maxCostUsd: needed.maxCostUsd },
  };
}

export async function ownerControl(deps: LinkedWorkDeps, record: ProjectRecord, input: OwnerActionInput, raise: RaiseDecision): Promise<OwnerActionOutcome> {
  const target = input.target?.trim() || input.milestoneId?.trim();
  if (!target) return { ok: false, text: 'target is required: the milestone id or research id whose work you control.' };
  if (!isControl(input.operation)) return { ok: false, text: `operation is required: one of ${CONTROL_OPERATIONS.join(', ')}.` };
  const outcome = await controlLinkedWork(deps, record, { target, operation: input.operation, maxMinutes: input.maxMinutes, maxCostUsd: input.maxCostUsd, by: 'owner' });
  if (outcome.needsApproval) return raise(approvalDraft(outcome.needsApproval), outcome.text.replace(/\.$/, ''));
  return { ok: outcome.ok, text: outcome.text, details: outcome.status ? { status: outcome.status } : {} };
}
