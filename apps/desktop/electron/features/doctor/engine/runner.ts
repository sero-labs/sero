/**
 * Doctor runner.
 *
 * Schedules registered checks via `Promise.allSettled`, wraps each in a
 * per-check timeout, enforces a global budget, and streams progress via
 * the optional `onProgress` callback.
 */

import os from 'os';
import { listChecks } from './registry';
import { buildReport } from './report';
import './checks';
import type {
  DoctorCategory,
  DoctorCheck,
  DoctorContext,
  DoctorMode,
  DoctorProgressEvent,
  DoctorReport,
  DoctorResult,
} from './types';
import type { ProfileSnapshot } from '../profile-state/types';

export interface RunOptions {
  mode: 'quick' | 'full';
  category?: DoctorCategory;
  signal?: AbortSignal;
  perCheckTimeoutMs?: number;
  onProgress?: (event: DoctorProgressEvent) => void;
  /** Use to drive deterministic tests. */
  now?: () => Date;
  /** Profile snapshots loaded by the caller. */
  profile: ProfileSnapshot | null;
  allProfiles: ProfileSnapshot[];
  seroVersion: string;
  /** 'in-app' enables `needsBootedApp` checks, 'safe' skips them. */
  contextMode: 'in-app' | 'safe';
}

const DEFAULT_PER_CHECK_TIMEOUT_MS = 3_000;

const QUICK_BUDGET_MS = 2_000;
const FULL_BUDGET_MS = 10_000;

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => T,
): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(onTimeout());
    }, ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(onTimeout());
      });
  });
}

function runCheck(
  check: DoctorCheck,
  ctx: DoctorContext,
  perCheckTimeoutMs: number,
): Promise<DoctorResult[]> {
  const start = Date.now();
  const synthFail = (message: string): DoctorResult => ({
    id: check.id,
    category: check.category,
    status: 'fail',
    message,
    durationMs: Date.now() - start,
  });

  const timeoutMs = perCheckTimeoutMs;
  const promise = (async (): Promise<DoctorResult[]> => {
    try {
      const result = await check.run(ctx);
      const list = Array.isArray(result) ? result : [result];
      return list.map((r) => ({
        ...r,
        durationMs: r.durationMs ?? Date.now() - start,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return [synthFail(`Check threw: ${message}`)];
    }
  })();

  return withTimeout(promise, timeoutMs, () => [
    synthFail(`Check timed out after ${timeoutMs}ms`),
  ]);
}

function getSelectedChecks(options: RunOptions): DoctorCheck[] {
  return listChecks({
    category: options.category,
    quick: options.mode === 'quick',
    safe: options.contextMode === 'safe',
  });
}

function reportMode(options: RunOptions): DoctorMode {
  if (options.contextMode === 'safe') return 'safe';
  if (options.mode === 'quick') return 'quick';
  return 'in-app';
}

export async function runDoctor(options: RunOptions): Promise<DoctorReport> {
  const start = Date.now();
  const budget = options.mode === 'quick' ? QUICK_BUDGET_MS : FULL_BUDGET_MS;
  const perCheckTimeoutMs = options.perCheckTimeoutMs ?? DEFAULT_PER_CHECK_TIMEOUT_MS;

  const globalAbort = new AbortController();
  const budgetTimer = setTimeout(() => globalAbort.abort(), budget);
  if (options.signal) {
    if (options.signal.aborted) globalAbort.abort();
    else options.signal.addEventListener('abort', () => globalAbort.abort(), { once: true });
  }

  const ctx: DoctorContext = {
    mode: options.contextMode,
    profile: options.profile,
    allProfiles: options.allProfiles,
    seroVersion: options.seroVersion,
    signal: globalAbort.signal,
    now: options.now ?? (() => new Date()),
  };

  const selected = getSelectedChecks(options);
  const all: DoctorResult[] = [];
  await Promise.all(
    selected.map(async (check) => {
      options.onProgress?.({
        kind: 'check-start',
        id: check.id,
        category: check.category,
      });
      const results = await runCheck(check, ctx, perCheckTimeoutMs);
      for (const result of results) {
        options.onProgress?.({ kind: 'check-done', result });
        all.push(result);
      }
    }),
  );

  clearTimeout(budgetTimer);

  const report = buildReport({
    results: all,
    profiles: options.allProfiles,
    mode: reportMode(options),
    seroVersion: options.seroVersion,
    durationMs: Date.now() - start,
    timestamp: ctx.now().toISOString(),
  });

  options.onProgress?.({ kind: 'all-done', report });
  return report;
}

export function describeSystem(): { os: string; version: string; arch: string } {
  return {
    os: os.platform(),
    version: os.release(),
    arch: process.arch,
  };
}
