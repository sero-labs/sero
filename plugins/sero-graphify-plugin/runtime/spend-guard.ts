import { formatEstimate, formatUsd } from '../shared/pricing';
import type { BuildEstimate, GraphifyState } from '../shared/types';
import { ledgerForDay, utcDay } from '../shared/ledger';

export { ledgerForDay, recordRun, utcDay } from '../shared/ledger';

/**
 * Everything that must be true before graphify is allowed to spend.
 *
 * Kept out of the indexer so the rules can be tested without a queue, a host,
 * or a child process — and so there is exactly one place that answers "may this
 * build run?".
 */

export type SpendDecision =
  | { allowed: true; estimate: BuildEstimate }
  | { allowed: false; reason: string; kind: 'paused' | 'no-model' | 'cap' | 'declined' | 'refused' };

export interface SpendHost {
  /** Measure the tree a build would read. */
  estimateBuild(workspace: { workspaceId: string; path: string }, settings: GraphifyState['settings']): Promise<BuildEstimate>;
  /** Ask the user. A dialog nobody answers must resolve to false. */
  confirm(options: { title: string; body: string; confirmLabel: string }): Promise<boolean>;
}

/**
 * Decide whether a paid build may start.
 *
 * The order matters. The cheap refusals (paused, no model chosen) come before
 * the scan, so a paused profile never walks a large tree; the caps come before
 * the confirmation, so the user is never asked to approve something that would
 * be refused anyway.
 */
export async function authorizePaidBuild(
  host: SpendHost,
  state: GraphifyState,
  workspace: { workspaceId: string; name: string; path: string },
  options: { alwaysConfirm: boolean; now: Date },
): Promise<SpendDecision> {
  const { settings } = state;
  if (settings.paused) {
    return { allowed: false, kind: 'paused', reason: 'Graphify indexing is paused. Turn it back on in the Graphify panel.' };
  }
  const choice = settings.model;
  if (!choice) {
    return {
      allowed: false,
      kind: 'no-model',
      reason: 'Choose a backend and model in the Graphify panel before the first build. Graphify never spends on a library default.',
    };
  }

  const estimate = await host.estimateBuild(workspace, settings);
  const caps = settings.caps;

  if (estimate.truncated || estimate.files > caps.maxFilesPerBuild) {
    return {
      allowed: false,
      kind: 'cap',
      reason: `${workspace.name} has more than ${caps.maxFilesPerBuild} files to index. Narrow it with exclude patterns, or raise the file limit in Graphify settings.`,
    };
  }

  const day = utcDay(options.now);
  const spentToday = ledgerForDay(state.spend, day).usd;

  if (estimate.estimatedCostUsd !== null) {
    if (estimate.estimatedCostUsd > caps.maxCostPerBuildUsd) {
      return {
        allowed: false,
        kind: 'cap',
        reason: `Indexing ${workspace.name} is estimated at ${formatUsd(estimate.estimatedCostUsd)}, over the ${formatUsd(caps.maxCostPerBuildUsd)} per-build limit. Raise the limit in Graphify settings, or exclude more of the workspace.`,
      };
    }
    if (spentToday + estimate.estimatedCostUsd > caps.maxCostPerDayUsd) {
      return {
        allowed: false,
        kind: 'cap',
        reason: `Today's Graphify spend (${formatUsd(spentToday)}) plus this build would pass the ${formatUsd(caps.maxCostPerDayUsd)} daily limit. Indexing stopped.`,
      };
    }
  }

  // An unpriced model cannot be checked against a cap, so it always asks.
  // Silently proceeding would turn "unknown price" into "no limit".
  const mustConfirm = options.alwaysConfirm || estimate.estimatedCostUsd === null;
  if (!mustConfirm) return { allowed: true, estimate };

  const approved = await host.confirm({
    title: `Index ${workspace.name}?`,
    body: [
      formatEstimate(estimate, choice),
      `Model: ${choice.modelId} (${choice.backend})`,
      estimate.estimatedCostUsd === null
        ? 'Sero has no price for this model, so the cost cannot be checked against your limits.'
        : `Spent today: ${formatUsd(spentToday)} of ${formatUsd(caps.maxCostPerDayUsd)}.`,
      'This is an estimate. The real cost depends on how the model chunks the workspace.',
    ].join('\n'),
    confirmLabel: 'Index workspace',
  });
  if (!approved) {
    return { allowed: false, kind: 'declined', reason: `Indexing ${workspace.name} was not approved.` };
  }
  return { allowed: true, estimate };
}
