#!/usr/bin/env node
/**
 * Summarise memory plugin metrics into a baseline report.
 *
 * Reads `metrics-YYYY-MM-DD.jsonl` files written by the memory plugin
 * (`plugins/sero-memory-plugin/extension/metrics.ts`) for a date range.
 *
 * Usage:
 *   node scripts/memory-metrics-report.mjs [--dir <path>] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--json]
 *
 * `--dir` defaults to `$SERO_HOME/debug/memory` (or `~/.sero-ui/debug/memory`).
 * The report is for measurement only; it never fails a build.
 */

import { readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const FILE_RE = /^metrics-(\d{4}-\d{2}-\d{2})\.jsonl$/;

function parseArgs(argv) {
  const args = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--dir' || arg === '--from' || arg === '--to') args[arg.slice(2)] = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  const seroHome = process.env.SERO_HOME?.trim() || path.join(os.homedir(), '.sero-ui');
  args.dir ??= path.join(seroHome, 'debug', 'memory');
  return args;
}

async function readEvents(dir, from, to) {
  const names = await readdir(dir).catch(() => []);
  const days = names
    .map((name) => FILE_RE.exec(name))
    .filter((match) => match && (!from || match[1] >= from) && (!to || match[1] <= to))
    .sort((a, b) => a[1].localeCompare(b[1]));
  const events = [];
  let invalidLines = 0;
  for (const match of days) {
    const content = await readFile(path.join(dir, match[0]), 'utf8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        invalidLines += 1;
      }
    }
  }
  return { events, days: days.map((match) => match[1]), invalidLines };
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const value = String(key(item) ?? 'unknown');
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

export function summarise(events) {
  const byEvent = countBy(events, (event) => event.event);
  const recalls = events.filter((event) => event.event === 'recall');
  const empties = events.filter((event) => event.event === 'recall-empty');
  const searchedTurns = recalls.length + empties.length;
  const latencies = [...recalls, ...empties]
    .map((event) => event.latencyMs)
    .filter((value) => typeof value === 'number');
  const injected = recalls.map((event) => (Array.isArray(event.ids) ? event.ids.length : 0));
  const tidy = events.filter((event) => event.event === 'tidy');
  const snapshots = events.filter((event) => event.event === 'snapshot');

  return {
    events: events.length,
    byEvent,
    saves: {
      total: byEvent.save ?? 0,
      byScope: countBy(events.filter((event) => event.event === 'save'), (event) => event.scope),
      byDelivery: countBy(events.filter((event) => event.event === 'save'), (event) => event.delivery),
    },
    recall: {
      searchedTurns,
      turnsWithRecall: recalls.length,
      emptyTurns: empties.length,
      recallRate: searchedTurns === 0 ? null : recalls.length / searchedTurns,
      memoriesInjected: injected.reduce((sum, count) => sum + count, 0),
      meanPerRecall: recalls.length === 0 ? null : injected.reduce((sum, count) => sum + count, 0) / recalls.length,
      latencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
      byMode: countBy([...recalls, ...empties], (event) => event.mode),
    },
    misses: byEvent.miss ?? 0,
    pinnedBreaks: byEvent['pinned-break'] ?? 0,
    unpins: byEvent.unpin ?? 0,
    restores: byEvent.restore ?? 0,
    tidy: {
      total: tidy.length,
      byDecision: countBy(tidy, (event) => event.decision),
      applied: tidy.filter((event) => event.applied === true).length,
      dropped: tidy.filter((event) => event.applied === false).length,
    },
    scratchpad: countBy(events.filter((event) => event.event === 'scratchpad'), (event) => event.action),
    latestSnapshot: snapshots.at(-1) ?? null,
  };
}

function formatRate(value) {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function formatCounts(counts) {
  const entries = Object.entries(counts);
  return entries.length === 0 ? 'none' : entries.map(([key, value]) => `${key}=${value}`).join(', ');
}

function printReport(summary, days, invalidLines) {
  const range = days.length === 0 ? 'no metrics files' : `${days[0]} to ${days.at(-1)} (${days.length} day(s))`;
  const lines = [
    `Memory metrics: ${range}`,
    `Events: ${summary.events}${invalidLines ? ` (${invalidLines} invalid line(s) skipped)` : ''}`,
    '',
    `Saves: ${summary.saves.total} (scope: ${formatCounts(summary.saves.byScope)}; delivery: ${formatCounts(summary.saves.byDelivery)})`,
    `Replaces: ${summary.byEvent.replace ?? 0}, removes: ${summary.byEvent.remove ?? 0}, restores: ${summary.restores}`,
    `Pins: ${summary.byEvent.pin ?? 0}, unpins: ${summary.unpins}`,
    '',
    `Recall: ${summary.recall.turnsWithRecall} of ${summary.recall.searchedTurns} searched turns (${formatRate(summary.recall.recallRate)})`,
    `  empty turns: ${summary.recall.emptyTurns}, memories injected: ${summary.recall.memoriesInjected}, mean per recall: ${summary.recall.meanPerRecall?.toFixed(2) ?? 'n/a'}`,
    `  latency p50: ${summary.recall.latencyMs.p50 ?? 'n/a'} ms, p95: ${summary.recall.latencyMs.p95 ?? 'n/a'} ms`,
    `  search mode: ${formatCounts(summary.recall.byMode)}`,
    `Misses: ${summary.misses}, pinned-rule breaks: ${summary.pinnedBreaks}`,
    '',
    `Tidy-up decisions: ${summary.tidy.total} (applied ${summary.tidy.applied}, dropped ${summary.tidy.dropped}; ${formatCounts(summary.tidy.byDecision)})`,
    `Scratchpad: ${formatCounts(summary.scratchpad)}`,
  ];
  if (summary.latestSnapshot) {
    const { pinnedGlobal, pinnedWorkspace, unsorted, scratchpadOpen } = summary.latestSnapshot;
    lines.push(`Latest snapshot: pinned global ${pinnedGlobal ?? 0}, pinned workspace ${pinnedWorkspace ?? 0}, unsorted ${unsorted ?? 0}, open scratchpad items ${scratchpadOpen ?? 0}`);
  }
  console.log(lines.join('\n'));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { events, days, invalidLines } = await readEvents(args.dir, args.from, args.to);
  const summary = summarise(events);
  if (args.json) console.log(JSON.stringify({ days, invalidLines, ...summary }, null, 2));
  else printReport(summary, days, invalidLines);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
