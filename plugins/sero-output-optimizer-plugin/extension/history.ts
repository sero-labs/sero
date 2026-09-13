import type { SessionMetrics } from './metrics';
import type { SessionState } from './state';

/**
 * Seed session accounting from persisted history.
 *
 * A resumed session, a replay, and a fork all carry tool results in their
 * history. Reading the persisted `optimization` metadata once per tool call
 * makes each session count each entry exactly once, and makes a fork inherit
 * the entries copied into it.
 */

interface HistoryOptimization {
  measured?: boolean;
  unmeasured?: boolean;
  inputBytes?: number;
  compactedBytes?: number;
  applied?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optimizationFrom(details: unknown): HistoryOptimization | null {
  if (!isRecord(details)) return null;
  const optimization = details.optimization;
  return isRecord(optimization) ? (optimization as HistoryOptimization) : null;
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function seedMetricsFromHistory(
  metrics: SessionMetrics,
  state: SessionState,
  entries: readonly unknown[],
): void {
  for (const entry of entries) {
    if (!isRecord(entry) || entry.type !== 'message') continue;
    const message = entry.message;
    if (!isRecord(message) || message.role !== 'toolResult' || message.toolName !== 'bash') continue;

    const toolCallId = typeof message.toolCallId === 'string' ? message.toolCallId : undefined;
    if (!toolCallId || !state.claimAccounting(toolCallId)) continue;

    const optimization = optimizationFrom(message.details);
    if (!optimization) continue;
    if (optimization.unmeasured === true) {
      metrics.recordUnmeasured();
      continue;
    }
    if (optimization.measured === true) {
      metrics.recordMeasured(
        numberOrZero(optimization.inputBytes),
        numberOrZero(optimization.compactedBytes),
        optimization.applied === true,
      );
    }
  }
}
