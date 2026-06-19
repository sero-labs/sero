import { loadGraph, queryGraph } from '../../shared/query-engine';
import type { GraphifyIntent } from './intent';

/**
 * Run a bounded graph query for auto-context augmentation using the TS engine
 * (no subprocess). Catches and silences all errors — auto-query must never
 * break the original tool result.
 */
export async function runAutoQuery(
  graphPath: string,
  intent: GraphifyIntent,
  budget: number,
  maxChars: number,
): Promise<string | undefined> {
  if (!intent.suggestedQuestion) return undefined;

  try {
    const graph = await loadGraph(graphPath);
    if (!graph) return undefined;
    const result = queryGraph(graph, intent.suggestedQuestion, { mode: 'bfs', budget });
    if (!result || result.trim().length === 0 || result.startsWith('No matching concepts')) return undefined;
    return result.length > maxChars ? result.slice(0, maxChars) + '…' : result;
  } catch {
    return undefined;
  }
}
