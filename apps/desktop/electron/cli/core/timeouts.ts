import type { CliSource } from './types';

const DEFAULT_BATCH_TIMEOUT_SEC = 120;
export const DEFAULT_PER_COMMAND_TIMEOUT_MS = 30_000;

/**
 * Build an optional batch deadline.
 *
 * Single-command tool invocations do not get the implicit batch deadline —
 * they rely on the command's own timeout instead. Multi-command batches still
 * keep the shared deadline so one slow command cannot consume the whole turn.
 */
export function buildBatchDeadline(
  source: CliSource,
  batchTimeoutSec: number | undefined,
  single: boolean,
): number | null {
  if (source === 'terminal') return null;
  if (single && batchTimeoutSec === undefined) return null;
  return Date.now() + Math.max(1, Math.floor(batchTimeoutSec ?? DEFAULT_BATCH_TIMEOUT_SEC)) * 1000;
}

export function resolveCommandTimeoutMs(
  batchDeadline: number | null,
  commandTimeoutMs?: number,
): number | null {
  const limit = commandTimeoutMs ?? DEFAULT_PER_COMMAND_TIMEOUT_MS;
  if (batchDeadline === null) return limit;
  const remaining = batchDeadline - Date.now();
  return Math.min(limit, remaining);
}
