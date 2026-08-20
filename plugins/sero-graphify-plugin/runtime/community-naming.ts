import { ledgerForDay, utcDay } from '../shared/ledger';
import {
  estimateCommunityNaming,
  formatCommunityNamingEstimate,
  formatUsd,
} from '../shared/pricing';
import type { BuildEstimate, GraphifyState, WorkspaceIndexEntry } from '../shared/types';

export type CommunityNamingDecision =
  | { allowed: true; estimate: BuildEstimate }
  | { allowed: false; reason: string; kind: 'paused' | 'no-model' | 'cap' | 'declined' | 'refused' };

interface ConfirmationHost {
  confirm(options: { title: string; body: string; confirmLabel: string }): Promise<boolean>;
}

/** Authorise the second paid pass from the measured community count. */
export async function authorizeCommunityNaming(
  host: ConfirmationHost,
  state: GraphifyState,
  workspace: WorkspaceIndexEntry,
  now: Date,
): Promise<CommunityNamingDecision> {
  if (state.settings.paused) {
    return { allowed: false, kind: 'paused', reason: 'Graphify indexing is paused. Turn it back on before naming communities.' };
  }
  const choice = state.settings.model;
  if (!choice) {
    return { allowed: false, kind: 'no-model', reason: 'Choose a backend and model before naming communities.' };
  }
  const communities = workspace.stats?.communities ?? 0;
  if (communities === 0) {
    return { allowed: false, kind: 'refused', reason: `${workspace.name} has no communities to name. Build its graph first.` };
  }

  const estimate = estimateCommunityNaming(communities, choice);
  const caps = state.settings.caps;
  const spentToday = ledgerForDay(state.spend, utcDay(now)).usd;
  if (estimate.estimatedCostUsd !== null) {
    if (estimate.estimatedCostUsd > caps.maxCostPerBuildUsd) {
      return {
        allowed: false,
        kind: 'cap',
        reason: `Naming ${workspace.name} is estimated at ${formatUsd(estimate.estimatedCostUsd)}, over the ${formatUsd(caps.maxCostPerBuildUsd)} per-job limit.`,
      };
    }
    if (spentToday + estimate.estimatedCostUsd > caps.maxCostPerDayUsd) {
      return {
        allowed: false,
        kind: 'cap',
        reason: `Today's Graphify spend plus community naming would pass the ${formatUsd(caps.maxCostPerDayUsd)} daily limit.`,
      };
    }
  }

  const approved = await host.confirm({
    title: `Name communities in ${workspace.name}?`,
    body: [
      formatCommunityNamingEstimate(communities, estimate, choice),
      `Model: ${choice.modelId} (${choice.backend})`,
      estimate.estimatedCostUsd === null
        ? 'Sero has no price for this model. Graphify has no total-token stop for extraction or labeling, so Sero cannot enforce a token cap after the process starts.'
        : `Spent today: ${formatUsd(spentToday)} of ${formatUsd(caps.maxCostPerDayUsd)}.`,
      'This is a separate paid job. It does not rebuild the graph.',
    ].join('\n'),
    confirmLabel: 'Name communities',
  });
  return approved
    ? { allowed: true, estimate }
    : { allowed: false, kind: 'declined', reason: `Community naming for ${workspace.name} was not approved.` };
}
