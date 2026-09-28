/**
 * Evaluation metrics — one JSON line per memory event, in
 * `<profile>/debug/memory/metrics-YYYY-MM-DD.jsonl`.
 *
 * `scripts/memory-metrics-report.mjs` summarises a date range of these files
 * into the baseline report. Metrics are best-effort: a failed write never
 * breaks the memory operation that produced it.
 */

import { appendRotatingLogLine } from './log-writer';
import { getLocalDayStamp } from './local-time';
import { resolveMemoryDebugPath } from './state-paths';

export type MemoryMetricName =
  | 'save'
  | 'replace'
  | 'remove'
  | 'restore'
  | 'pin'
  | 'unpin'
  | 'recall'
  | 'recall-empty'
  | 'miss'
  | 'pinned-break'
  | 'tidy'
  | 'scratchpad'
  | 'snapshot';

/** A metrics file never rotates; one day of events stays in one file. */
const MAX_METRICS_FILE_BYTES = 256 * 1024 * 1024;

export function resolveMetricsPath(date = new Date()): string {
  return resolveMemoryDebugPath(`metrics-${getLocalDayStamp(date)}.jsonl`);
}

export function recordMetric(event: MemoryMetricName, data: Record<string, unknown> = {}): Promise<void> {
  const now = new Date();
  let line: string;
  try {
    line = JSON.stringify({ ts: now.toISOString(), event, ...data });
  } catch {
    line = JSON.stringify({ ts: now.toISOString(), event, serialization: 'failed' });
  }
  return appendRotatingLogLine({
    filePath: resolveMetricsPath(now),
    line: `${line}\n`,
    maxBytes: MAX_METRICS_FILE_BYTES,
    warningKey: 'memory-metrics',
    warningMessage: '[memory] failed to write a metrics event',
  });
}
