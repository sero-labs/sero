#!/usr/bin/env node
/**
 * A/B benchmark: the Bash-only search path against the FFF tool path.
 *
 * Runs every task in `tasks.mjs` twice — once as the `rg`/`find` shell command
 * an agent writes today, once through the plugin's engine — and records what
 * the issue asks for: search calls, result tokens, time to the first relevant
 * file, wall time, initial indexing time, and peak memory.
 *
 * What it does NOT measure is model behaviour: whether a task completed, and
 * how many follow-up searches the model chose to make, need a model in the
 * loop. This harness measures the search path itself, so a change to it is
 * comparable run to run; `bench/README.md` says how the two fit together.
 *
 * Usage: node bench/run-benchmark.mjs [--repo <path>] [--json <file>]
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { FileFinder } from '@ff-labs/fff-node';

import { TASKS } from './tasks.mjs';

const DEFAULT_LIMIT = 20;

function parseArgs(argv) {
  const args = { repo: process.cwd(), json: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--repo') args.repo = path.resolve(argv[index + 1]);
    if (argv[index] === '--json') args.json = path.resolve(argv[index + 1]);
  }
  return args;
}

/** A crude but stable token proxy: models see this text, not these bytes. */
function tokens(text) {
  return Math.ceil(text.length / 4);
}

function rankOfAnswer(paths, answer) {
  const index = paths.findIndex((candidate) => candidate === answer);
  return index === -1 ? null : index + 1;
}

function runRipgrep(repo, task) {
  const args = task.rg.kind === 'files'
    ? ['--files']
    : ['--no-heading', '--line-number', '--color', 'never', task.rg.pattern, '.'];

  const started = process.hrtime.bigint();
  let stdout = '';
  try {
    stdout = execFileSync('rg', args, { cwd: repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  } catch (error) {
    // rg exits 1 on no matches; anything else is a real failure.
    if (error.status !== 1) throw error;
  }
  let lines = stdout.split('\n').filter(Boolean);
  if (task.rg.kind === 'files') {
    const filter = new RegExp(task.rg.pattern, 'i');
    lines = lines.filter((line) => filter.test(line));
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  const output = lines.join('\n');
  const paths = lines.map((line) => line.replace(/^\.\//, '').split(':')[0]);
  return {
    elapsedMs,
    resultTokens: tokens(output),
    resultLines: lines.length,
    rank: rankOfAnswer([...new Set(paths)], task.answer),
  };
}

function runFff(finder, task) {
  const started = process.hrtime.bigint();
  let result;
  if (task.fff.kind === 'find') {
    result = finder.fileSearch(task.fff.pattern, { pageSize: DEFAULT_LIMIT });
  } else if (task.fff.kind === 'multi_grep') {
    result = finder.multiGrep({
      patterns: task.fff.patterns,
      pageSize: DEFAULT_LIMIT,
      maxMatchesPerFile: DEFAULT_LIMIT,
    });
  } else {
    result = finder.grep(task.fff.pattern, {
      mode: 'plain',
      pageSize: DEFAULT_LIMIT,
      maxMatchesPerFile: DEFAULT_LIMIT,
    });
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  if (!result.ok) throw new Error(`${task.id}: ${result.error}`);

  const lines = result.value.items.map((item) => (
    task.fff.kind === 'find'
      ? item.relativePath
      : `${item.relativePath}:${item.lineNumber}: ${item.lineContent.trim()}`
  ));
  const paths = result.value.items.map((item) => item.relativePath);
  return {
    elapsedMs,
    resultTokens: tokens(lines.join('\n')),
    resultLines: lines.length,
    rank: rankOfAnswer([...new Set(paths)], task.answer),
  };
}

function peakRssMb() {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

function pad(value, width) {
  return String(value).padEnd(width);
}

function formatTable(rows) {
  const header = ['task', 'rg lines', 'fff lines', 'rg tokens', 'fff tokens', 'rg ms', 'fff ms', 'rg rank', 'fff rank'];
  const widths = header.map((name, column) => Math.max(
    name.length,
    ...rows.map((row) => String(row[column]).length),
  ));
  const line = (cells) => `| ${cells.map((cell, column) => pad(cell, widths[column])).join(' | ')} |`;
  return [
    line(header),
    `|${widths.map((width) => '-'.repeat(width + 2)).join('|')}|`,
    ...rows.map(line),
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.repo)) throw new Error(`No such repository: ${args.repo}`);

  const rssBefore = peakRssMb();
  const indexStarted = process.hrtime.bigint();
  const created = FileFinder.create({ basePath: args.repo, aiMode: true });
  if (!created.ok) throw new Error(`Could not index ${args.repo}: ${created.error}`);
  const finder = created.value;
  await finder.waitForScan(60_000);
  await finder.waitForIndexReady(60_000);
  const indexingMs = Number(process.hrtime.bigint() - indexStarted) / 1e6;
  const rssAfterIndex = peakRssMb();

  // One untimed pass so the shell arm is not charged for a cold page cache the
  // indexed arm never pays.
  runRipgrep(args.repo, { rg: { kind: 'content', pattern: 'warmup-pass-marker' }, answer: '' });

  const results = [];
  for (const task of TASKS) {
    results.push({ id: task.id, question: task.question, rg: runRipgrep(args.repo, task), fff: runFff(finder, task) });
  }
  const rssAfterSearches = peakRssMb();
  const progress = finder.getScanProgress();
  finder.destroy();

  const rows = results.map((entry) => [
    entry.id,
    entry.rg.resultLines,
    entry.fff.resultLines,
    entry.rg.resultTokens,
    entry.fff.resultTokens,
    entry.rg.elapsedMs.toFixed(1),
    entry.fff.elapsedMs.toFixed(1),
    entry.rg.rank ?? 'miss',
    entry.fff.rank ?? 'miss',
  ]);

  const total = (arm, field) => results.reduce((sum, entry) => sum + entry[arm][field], 0);
  const summary = {
    repo: args.repo,
    indexedFiles: progress.ok ? progress.value.scannedFilesCount : null,
    initialIndexingMs: Math.round(indexingMs),
    rssBeforeIndexMb: rssBefore,
    rssAfterIndexMb: rssAfterIndex,
    peakRssMb: rssAfterSearches,
    tasks: results.length,
    rg: {
      resultTokens: total('rg', 'resultTokens'),
      wallMs: Math.round(total('rg', 'elapsedMs')),
      found: results.filter((entry) => entry.rg.rank !== null).length,
      topOne: results.filter((entry) => entry.rg.rank === 1).length,
    },
    fff: {
      resultTokens: total('fff', 'resultTokens'),
      wallMs: Math.round(total('fff', 'elapsedMs')),
      found: results.filter((entry) => entry.fff.rank !== null).length,
      topOne: results.filter((entry) => entry.fff.rank === 1).length,
    },
  };

  console.log(`\nRepository: ${summary.repo}`);
  console.log(`Indexed files: ${summary.indexedFiles ?? 'unknown'}`);
  console.log(`Initial indexing: ${summary.initialIndexingMs} ms`);
  console.log(`RSS before index / after index / peak: ${summary.rssBeforeIndexMb} / ${summary.rssAfterIndexMb} / ${summary.peakRssMb} MB\n`);
  console.log(formatTable(rows));
  console.log(`\nSearch-result tokens  rg ${summary.rg.resultTokens}  →  fff ${summary.fff.resultTokens}`);
  console.log(`Search wall time      rg ${summary.rg.wallMs} ms  →  fff ${summary.fff.wallMs} ms`);
  console.log(`Answer in results     rg ${summary.rg.found}/${summary.tasks}  →  fff ${summary.fff.found}/${summary.tasks}`);
  console.log(`Answer ranked first   rg ${summary.rg.topOne}/${summary.tasks}  →  fff ${summary.fff.topOne}/${summary.tasks}`);

  if (args.json) {
    fs.mkdirSync(path.dirname(args.json), { recursive: true });
    fs.writeFileSync(args.json, `${JSON.stringify({ summary, results }, null, 2)}\n`);
    console.log(`\nWrote ${args.json}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
