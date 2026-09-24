/**
 * What the inspector can show for a run (spec architect-run-observability).
 *
 * A run that has not answered yet is loading, not empty. A run whose journal
 * holds nothing says so once, and shows no tiles or charts: an empty tile reads
 * as a measured zero. Every other state is shown by the rows and tiles
 * themselves, each with a word, so no status depends on colour.
 */

import type { TracePage } from './trace';

export const NOTHING_RECORDED = 'Nothing recorded for this run yet.';

export type InspectorPhase = 'loading' | 'empty' | 'ready';

export function inspectorPhase(input: { loading: boolean; page: TracePage | null }): InspectorPhase {
  const { page } = input;
  if (!page) return input.loading ? 'loading' : 'empty';
  if (!page.recorded) return 'empty';
  return page.activity.nodes.length === 0 && page.records.length === 0 && page.summary.attributableUsd === 0 ? 'empty' : 'ready';
}
