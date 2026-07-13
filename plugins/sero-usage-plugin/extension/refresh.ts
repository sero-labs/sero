/**
 * Refresh orchestration: scan → aggregate → state.json.
 *
 * The in-flight guard is a module-level singleton (same pattern as the
 * cron scheduler): concurrent refresh calls — e.g. the app and the
 * dashboard widget mounting together — share one scan instead of
 * starting another.
 */

import { formatCost, formatCount, formatTokens } from '../shared/format';
import type { UsageState } from '../shared/types';
import { aggregate } from './aggregate';
import { collectSessionFiles } from './scan';
import { loadScanCache, saveScanCache, scanWithCache } from './scan-cache';
import { readState, resolveScanCachePath, resolveSessionsDir, resolveStatePath, writeJsonFile } from './state-io';

/** Non-forced refreshes within this window are treated as already fresh. */
const FRESH_WINDOW_MS = 60_000;

export interface RefreshSummary {
  files: number;
  reused: number;
  durationMs: number;
  state: UsageState;
  skipped: boolean;
}

let refreshInFlight: Promise<RefreshSummary> | null = null;

export function runRefresh(force: boolean): Promise<RefreshSummary> {
  if (refreshInFlight) return refreshInFlight;

  const refresh = doRefresh(force).finally(() => {
    refreshInFlight = null;
  });
  refreshInFlight = refresh;
  return refresh;
}

async function doRefresh(force: boolean): Promise<RefreshSummary> {
  const startedAt = Date.now();
  const statePath = resolveStatePath();
  const previousState = await readState(statePath);

  if (
    !force &&
    previousState.lastRefreshedAt !== null &&
    startedAt - previousState.lastRefreshedAt < FRESH_WINDOW_MS
  ) {
    return {
      files: previousState.lastScan?.files ?? 0,
      reused: previousState.lastScan?.reused ?? 0,
      durationMs: 0,
      state: previousState,
      skipped: true,
    };
  }

  const sessionsDir = resolveSessionsDir();
  const cachePath = resolveScanCachePath();
  const cache = await loadScanCache(cachePath);

  const sessionFiles = await collectSessionFiles(sessionsDir);
  const scan = await scanWithCache(sessionFiles, cache);
  await saveScanCache(cachePath, scan.cache);

  const { periods, daily, hourly } = aggregate(scan.sessions);
  const durationMs = Date.now() - startedAt;

  // Re-read settings just before writing so a mid-scan settings change
  // from the UI is not clobbered.
  const currentState = await readState(statePath);
  const state: UsageState = {
    schemaVersion: 1,
    settings: currentState.settings,
    lastRefreshedAt: Date.now(),
    lastScan: { files: scan.files, reused: scan.reused, durationMs },
    periods,
    daily,
    hourly,
  };
  await writeJsonFile(statePath, state);

  return { files: scan.files, reused: scan.reused, durationMs, state, skipped: false };
}

export function summarizeRefresh(summary: RefreshSummary): string {
  if (summary.skipped) {
    return 'Usage data is already fresh (refreshed under a minute ago).';
  }
  const totals = summary.state.periods.allTime.totals;
  return (
    `Scanned ${summary.files} session files (${summary.reused} unchanged, from cache) in ${summary.durationMs}ms. ` +
    `All time: ${formatCost(totals.cost)} · ${formatTokens(totals.tokens.total)} tokens · ` +
    `${formatCount(totals.sessions)} sessions · ${formatCount(totals.messages)} messages.`
  );
}
