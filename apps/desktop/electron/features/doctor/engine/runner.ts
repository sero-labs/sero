/**
 * Doctor runner.
 *
 * Schedules registered checks via `Promise.allSettled`, wraps each in a
 * per-check timeout, enforces a global budget by racing the whole
 * execution against a deadline (unfinished checks get synthesised
 * timeout results), and streams progress via the optional `onProgress`
 * callback.
 */

import os from 'os';
import { randomUUID } from 'crypto';
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
  /** Caller-supplied run identifier. Generated when omitted. */
  runId?: string;
  /** Override the global budget. Tests use this; callers should not. */
  globalBudgetMs?: number;
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

function defaultBudget(mode: 'quick' | 'full'): number {
  return mode === 'quick' ? QUICK_BUDGET_MS : FULL_BUDGET_MS;
}

export async function runDoctor(options: RunOptions): Promise<DoctorReport> {
  const start = Date.now();
  const budget = options.globalBudgetMs ?? defaultBudget(options.mode);
  const perCheckTimeoutMs = options.perCheckTimeoutMs ?? DEFAULT_PER_CHECK_TIMEOUT_MS;
  const runId = options.runId ?? randomUUID();

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
  const completed = new Set<string>();

  const emit = (event: DoctorProgressEvent): void => {
    options.onProgress?.(event);
  };

  emit({ kind: 'all-start', runId });

  const checkPromises = selected.map(async (check) => {
    emit({
      kind: 'check-start',
      runId,
      id: check.id,
      category: check.category,
    });
    const results = await runCheck(check, ctx, perCheckTimeoutMs);
    completed.add(check.id);
    for (const result of results) {
      emit({ kind: 'check-done', runId, result });
      all.push(result);
    }
  });

  // Race the whole batch against the global budget. On budget exhaustion
  // we synthesise fail results for every check that did not complete and
  // stop waiting for stragglers.
  let budgetExceeded = false;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    Promise.all(checkPromises).then(finish, finish);
    const budgetMs = Math.max(0, budget);
    setTimeout(() => {
      if (settled) return;
      budgetExceeded = true;
      finish();
    }, budgetMs);
  });

  if (budgetExceeded) {
    for (const check of selected) {
      if (completed.has(check.id)) continue;
      const result: DoctorResult = {
        id: check.id,
        category: check.category,
        status: 'fail',
        message: `Check did not complete before global budget (${budget}ms) elapsed.`,
        durationMs: Date.now() - start,
      };
      emit({ kind: 'check-done', runId, result });
      all.push(result);
    }
  }

  clearTimeout(budgetTimer);

  const report = buildReport({
    results: all,
    profiles: options.allProfiles,
    mode: reportMode(options),
    seroVersion: options.seroVersion,
    durationMs: Date.now() - start,
    timestamp: ctx.now().toISOString(),
    runId,
  });

  emit({ kind: 'all-done', runId, report });
  return report;
}

export function describeSystem(): { os: string; version: string; arch: string } {
  return {
    os: os.platform(),
    version: os.release(),
    arch: process.arch,
  };
}
