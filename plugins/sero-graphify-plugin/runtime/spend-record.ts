import type { BuildEstimate, GraphifyState, WorkspaceIndexStats } from '../shared/types';
import { costUsd } from '../shared/pricing';
import { recordRun, utcDay } from '../shared/ledger';
import type { IndexerHost } from './indexer-host';

/**
 * Writing down what a build was authorised to spend, and what it actually did.
 *
 * Separated from the queue because the ordering is the whole point: the debit
 * happens BEFORE the process starts, and is settled afterwards only if the
 * build succeeded.
 */

/**
 * Debit the authorised estimate and return the id that settles it.
 *
 * An extraction can consume tokens and then exit non-zero, reporting nothing.
 * A ledger written only on success would therefore let a failing workspace be
 * retried all day against a cap that still reads $0 — and a failing build is
 * the incident this whole change exists to stop. The reservation is left
 * standing when a build fails, which is the conservative answer.
 */
export async function reserveEstimate(
  host: IndexerHost,
  workspaceId: string,
  settings: GraphifyState['settings'],
  estimate: BuildEstimate,
  startedAt: string,
  job: 'build' | 'community-naming' = 'build',
): Promise<string | null> {
  const choice = settings.model;
  if (!choice) return null;
  const id = `${workspaceId}:${job}:${startedAt}`;
  await host.updateState((current) => ({
    ...current,
    spend: recordRun(current.spend, {
      id,
      workspaceId,
      job,
      backend: choice.backend,
      model: choice.modelId,
      inputTokens: estimate.estimatedInputTokens,
      outputTokens: estimate.estimatedOutputTokens,
      usd: estimate.estimatedCostUsd ?? 0,
      at: startedAt,
      estimated: true,
    }, utcDay(new Date())),
  }));
  return id;
}

export interface SettledStats {
  stats: WorkspaceIndexStats;
  inputTokens: number;
  outputTokens: number;
  /** Null when the chosen model has no known price. */
  spentUsd: number | null;
  /**
   * False when the reservation must stand as it is.
   *
   * A successful exit is not proof that usage was measured: the token line is
   * absent from some outputs and can be cut from a truncated one, and the
   * parser reports zeros for anything it does not recognise. Settling on that
   * would write $0 over a conservative debit and hand back the daily cap.
   */
  canSettle: boolean;
}

/**
 * Assemble the stats a finished job should store.
 *
 * A free AST update reports no tokens, so the paid build's numbers are kept
 * rather than showing a graph that looks like it cost nothing.
 */
export function settleStats(
  paid: boolean,
  settings: GraphifyState['settings'],
  outcome: { stats: WorkspaceIndexStats; usageMeasured: boolean },
  previous: WorkspaceIndexStats | undefined,
  graphifyVersion: string | undefined,
): SettledStats {
  const choice = settings.model;
  const fresh = outcome.stats;
  const inputTokens = fresh.inputTokens || (paid ? 0 : previous?.inputTokens ?? 0);
  const outputTokens = fresh.outputTokens || (paid ? 0 : previous?.outputTokens ?? 0);
  const spentUsd = paid && choice ? costUsd(choice, inputTokens, outputTokens) : null;
  return {
    inputTokens,
    outputTokens,
    spentUsd,
    canSettle: outcome.usageMeasured,
    stats: {
      ...fresh,
      inputTokens,
      outputTokens,
      costUsd: paid ? (outcome.usageMeasured ? spentUsd ?? undefined : undefined) : previous?.costUsd,
      model: paid ? choice?.modelId : previous?.model,
      backend: paid ? choice?.backend : previous?.backend,
      graphifyVersion: paid ? graphifyVersion : previous?.graphifyVersion,
    },
  };
}
