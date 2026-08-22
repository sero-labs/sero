#!/usr/bin/env node
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TEST_FILE = /(?:^|\/)(?:[^/]+\.)?(?:test|spec)\.[cm]?[jt]sx?$/i;
const DECLARATION = /\b(?:describe|suite|test|it|specify)\s*\(/g;
const MOCK_SIGNAL = /\b(?:vi|jest)\.(?:mock|spyOn|fn)\s*\(|\bmock(?:Implementation|ReturnValue)?\s*\(/g;
const TEXT_ASSERTION = /\bexpect\s*\([^\n]*\)\.(?:toContain|toMatch|toHaveTextContent|toBeTruthy|toBeFalsy)\s*\(/g;
const ENVIRONMENT = /\b(?:process\.env|NODE_ENV|process\.platform|process\.version|globalThis\.(?:window|document))\b/g;

export function selectTestFiles(paths) {
  return paths.filter((file) => TEST_FILE.test(file)).sort();
}

function count(pattern, text) {
  return text.match(pattern)?.length ?? 0;
}

export function analyzeFiles(files) {
  const perFile = files.map(({ path: filePath, content }) => ({
    path: filePath,
    loc: content.split(/\r?\n/).filter((line) => line.trim()).length,
    declarations: count(DECLARATION, content),
    mockSignals: count(MOCK_SIGNAL, content),
    textAssertionSignals: count(TEXT_ASSERTION, content),
    environmentSignals: count(ENVIRONMENT, content),
  }));
  return {
    testFileCount: perFile.length,
    testLoc: perFile.reduce((total, file) => total + file.loc, 0),
    testDeclarations: perFile.reduce((total, file) => total + file.declarations, 0),
    mockSignals: perFile.reduce((total, file) => total + file.mockSignals, 0),
    textAssertionSignals: perFile.reduce((total, file) => total + file.textAssertionSignals, 0),
    environmentSignals: perFile.reduce((total, file) => total + file.environmentSignals, 0),
    runtimeMs: null,
    perFile,
  };
}

export function formatText(metrics) {
  return [
    'Test advisory (heuristic signals only; no KEEP/REWRITE/MERGE/DELETE recommendations)',
    `Test files: ${metrics.testFileCount}`,
    `Test LOC: ${metrics.testLoc}`,
    `Test declarations: ${metrics.testDeclarations}`,
    `Mock signals (advisory): ${metrics.mockSignals}`,
    `Text-assertion signals (advisory): ${metrics.textAssertionSignals}`,
    `Environment signals (advisory): ${metrics.environmentSignals}`,
    `Runtime: ${metrics.runtimeMs === null ? 'not-measured' : `${metrics.runtimeMs} ms`}`,
    'Per-file size (non-blank LOC):',
    ...metrics.perFile.map((file) => `- ${file.path}: ${file.loc}`),
  ].join('\n');
}

export function formatGithubSummary(metrics) {
  return [
    '## Test advisory',
    '> Heuristic advisory metrics only. No KEEP/REWRITE/MERGE/DELETE recommendation is assigned.',
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    `| Test files | ${metrics.testFileCount} |`,
    `| Test LOC | ${metrics.testLoc} |`,
    `| Test declarations | ${metrics.testDeclarations} |`,
    `| Mock signals (advisory) | ${metrics.mockSignals} |`,
    `| Text-assertion signals (advisory) | ${metrics.textAssertionSignals} |`,
    `| Environment signals (advisory) | ${metrics.environmentSignals} |`,
    `| Runtime | ${metrics.runtimeMs === null ? 'not-measured' : `${metrics.runtimeMs} ms`} |`,
    '',
    '### Per-file size (non-blank LOC)',
    ...metrics.perFile.map((file) => `- \`${file.path}\`: ${file.loc}`),
  ].join('\n');
}

export function formatOutput(metrics, format = 'text') {
  if (format === 'json') return JSON.stringify(metrics, null, 2);
  if (format === 'github') return formatGithubSummary(metrics);
  return formatText(metrics);
}

export async function discoverTrackedTestFiles(repoRoot) {
  const { stdout } = await execFileAsync('git', ['-C', repoRoot, 'ls-files', '--'], { encoding: 'utf8' });
  const selected = selectTestFiles(stdout.split(/\r?\n/).filter(Boolean));
  return Promise.all(selected.map(async (filePath) => ({
    path: filePath,
    content: await fs.readFile(path.join(repoRoot, filePath), 'utf8'),
  })));
}

export async function collectMetrics(repoRoot, runtime = false) {
  const metrics = analyzeFiles(await discoverTrackedTestFiles(repoRoot));
  if (runtime) {
    const start = performance.now();
    await execFileAsync('pnpm', ['test'], { cwd: repoRoot, stdio: 'inherit' });
    metrics.runtimeMs = Math.round(performance.now() - start);
  }
  return metrics;
}

async function main(argv) {
  const format = argv.includes('--json') ? 'json' : argv.includes('--github') ? 'github' : 'text';
  const metrics = await collectMetrics(path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), argv.includes('--runtime'));
  process.stdout.write(`${formatOutput(metrics, format)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
