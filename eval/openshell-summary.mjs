#!/usr/bin/env node
/**
 * Export a simple OpenShell eval artifact summary.
 *
 * Usage:
 *   node eval/openshell-summary.mjs
 *   node eval/openshell-summary.mjs --format csv --out eval/output/openshell-summary.csv
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
const root = process.cwd();
const resultsDir = resolve(root, args.resultsDir ?? 'eval/output/openshell');
const format = args.format ?? 'json';
const out = args.out ?? `eval/output/openshell-summary.${format}`;

if (format !== 'json' && format !== 'csv') {
  console.error(`Unsupported format: ${format}. Use json or csv.`);
  process.exit(1);
}

const rows = await loadRows(resultsDir);
const content = format === 'csv' ? toCsv(rows) : `${JSON.stringify(rows, null, 2)}\n`;
await writeFile(resolve(root, out), content, 'utf8');
console.log(`Wrote ${rows.length} OpenShell eval rows to ${out}`);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--format') parsed.format = argv[++index];
    else if (arg === '--out') parsed.out = argv[++index];
    else if (arg === '--results-dir') parsed.resultsDir = argv[++index];
    else if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }
  return parsed;
}

function printHelp() {
  console.log(`Export a simple OpenShell eval artifact summary.\n\nUsage:\n  node eval/openshell-summary.mjs\n  node eval/openshell-summary.mjs --format csv --out eval/output/openshell-summary.csv\n\nOptions:\n  --format json|csv       Output format, default json\n  --out <path>            Output path\n  --results-dir <path>    Artifact directory, default eval/output/openshell`);
}

async function loadRows(dir) {
  if (!existsSync(dir)) return [];
  const resultPaths = await findResultFiles(dir, 3);
  const rows = [];
  for (const resultPath of resultPaths) {
    rows.push(toRow(resultPath, await readJson(resultPath)));
  }
  return rows.sort((a, b) => a.sandboxName.localeCompare(b.sandboxName));
}

async function findResultFiles(dir, depth) {
  if (depth < 0 || !existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isFile() && entry.name === 'result.json') results.push(path);
    if (entry.isDirectory()) results.push(...await findResultFiles(path, depth - 1));
  }
  return results;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function toRow(resultPath, result) {
  const meta = result.metadata ?? {};
  const commands = meta.commands ?? [];
  return {
    sandboxName: meta.sandboxName ?? '',
    providerId: meta.providerId ?? '',
    gatewayName: meta.gatewayName ?? '',
    failed: Boolean(result.failed),
    retainedSandbox: Boolean(meta.retainedSandbox),
    commandCount: commands.length,
    failedCommandCount: commands.filter((command) => command.exitCode !== 0).length,
    totalCommandDurationMs: commands.reduce((sum, command) => sum + (command.durationMs ?? 0), 0),
    runtimeWorkspacePath: meta.runtimeWorkspacePath ?? '',
    artifactPath: meta.artifactPath ?? resultPath.replace(/\/result\.json$/, ''),
    cleanupError: meta.cleanupError ?? '',
    error: result.error ?? '',
  };
}

function toCsv(rows) {
  const headers = [
    'sandboxName',
    'providerId',
    'gatewayName',
    'failed',
    'retainedSandbox',
    'commandCount',
    'failedCommandCount',
    'totalCommandDurationMs',
    'runtimeWorkspacePath',
    'artifactPath',
    'cleanupError',
    'error',
  ];
  return [headers.join(','), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))].join('\n') + '\n';
}

function csvCell(value) {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}
