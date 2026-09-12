import fs from 'node:fs';
import path from 'node:path';

import {
  emptySessionSavings,
  type RtkStatusState,
  type RtkStatusView,
  type SessionSavings,
} from '../shared/types';
import { resolveSeroHome } from './paths';

/**
 * The settings surface's live values, shared across sessions.
 *
 * The chat session owns compaction accounting and resolves RTK. The settings
 * UI runs in an isolated app session that sees neither. The chat session
 * publishes both to the profile state directory, so any session can read the
 * same view. A missing or unreadable file is not an error: the reader falls
 * back to its own state.
 */

export interface OptimizerStatus {
  savings: SessionSavings;
  rtk: RtkStatusView;
}

const RTK_STATES: ReadonlySet<string> = new Set(['unknown', 'available', 'installing', 'failed']);

/** Absolute path of the shared status file. */
export function resolveOptimizerStatusPath(): string {
  return path.join(resolveSeroHome(), 'state', 'output-optimizer', 'status.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizeSavings(value: unknown): SessionSavings {
  const savings = emptySessionSavings();
  if (!isRecord(value)) return savings;
  return {
    measuredCalls: numberOrZero(value.measuredCalls),
    unmeasuredCalls: numberOrZero(value.unmeasuredCalls),
    inputBytes: numberOrZero(value.inputBytes),
    compactedBytes: numberOrZero(value.compactedBytes),
    optimizedCalls: numberOrZero(value.optimizedCalls),
    skippedCalls: numberOrZero(value.skippedCalls),
  };
}

function normalizeRtk(value: unknown): RtkStatusView {
  if (!isRecord(value) || typeof value.state !== 'string' || !RTK_STATES.has(value.state)) {
    return { state: 'unknown' };
  }
  const rtk: RtkStatusView = { state: value.state as RtkStatusState };
  if (typeof value.version === 'string' && value.version) rtk.version = value.version;
  if (typeof value.reason === 'string' && value.reason) rtk.reason = value.reason;
  return rtk;
}

function normalizeStatus(value: unknown): OptimizerStatus {
  const record = isRecord(value) ? value : {};
  return { savings: normalizeSavings(record.savings), rtk: normalizeRtk(record.rtk) };
}

/** Read the shared status, or null when it has not been written yet. */
export async function loadStatus(): Promise<OptimizerStatus | null> {
  try {
    const raw = await fs.promises.readFile(resolveOptimizerStatusPath(), 'utf8');
    return normalizeStatus(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Atomic write: temp file, then rename. */
async function saveStatus(status: OptimizerStatus): Promise<void> {
  const target = resolveOptimizerStatusPath();
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(temporary, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
  await fs.promises.rename(temporary, target);
}

/**
 * Publish a change to the shared status.
 *
 * A partial write merges into the file's current content, so a writer of the
 * savings field does not clobber a concurrent writer of the RTK field. A
 * failure here must never affect command output, so it is swallowed.
 */
export class StatusStore {
  async read(): Promise<OptimizerStatus | null> {
    return loadStatus();
  }

  async publish(partial: Partial<OptimizerStatus>): Promise<void> {
    try {
      const current = (await loadStatus()) ?? { savings: emptySessionSavings(), rtk: { state: 'unknown' } };
      const next: OptimizerStatus = { ...current, ...partial };
      if (JSON.stringify(next) === JSON.stringify(current)) return;
      await saveStatus(next);
    } catch {
      // Settings sharing is best-effort and never blocks a result.
    }
  }
}
