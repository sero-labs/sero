#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TEST_FILE = /(?:^|\/)(?:[^/]+\.)?(?:test|spec)\.[cm]?[jt]sx?$/i;
const GENERATED_PATH = /(?:^|\/)(?:coverage|dist|node_modules|out)(?:\/|$)/;
const TEST_DECLARATION = /\b(?:it|test|specify)(?:\.(?:concurrent|each|fails|only|sequential|skip|todo))*\s*\(/g;
const MOCK_SIGNAL = /\b(?:vi|jest)\.(?:mock|spyOn|fn)\s*\(|\bmock(?:Implementation|ReturnValue)?\s*\(/g;
const TEXT_ASSERTION = /\bexpect\s*\([^\n]*\)\.(?:toContain|toHaveAccessibleName|toHaveTextContent|toMatch)\s*\(/g;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function selectTestFiles(paths) {
  return paths.filter((file) => TEST_FILE.test(file) && !GENERATED_PATH.test(file)).sort();
}

function count(pattern, text) {
  return text.match(pattern)?.length ?? 0;
}

function testEnvironment(filePath, content) {
  const pragma = content.match(/^\s*\/\/\s*@vitest-environment\s+(node|jsdom|happy-dom|edge-runtime)\s*$/m)?.[1];
  if (pragma) return pragma;
  if (filePath.includes('/e2e/') || content.includes("from '@playwright/test'")) return 'playwright';
  if (filePath.endsWith('.tsx') || /\b(?:document|window)\b/.test(content)) return 'jsdom';
  return 'node';
}

function physicalLineCount(content) {
  if (content === '') return 0;
  return content.split(/\r?\n/).length - Number(content.endsWith('\n'));
}

export function analyzeFiles(files) {
  const perFile = files.map(({ path: filePath, content }) => {
    return {
      path: filePath,
      loc: physicalLineCount(content),
      testDeclarations: count(TEST_DECLARATION, content),
      mockSignals: count(MOCK_SIGNAL, content),
      textAssertionSignals: count(TEXT_ASSERTION, content),
      environment: testEnvironment(filePath, content),
    };
  });
  const environments = Object.fromEntries(
    [...new Set(perFile.map((file) => file.environment))]
      .sort()
      .map((environment) => [environment, perFile.filter((file) => file.environment === environment).length]),
  );
  return {
    testFileCount: perFile.length,
    testLoc: perFile.reduce((total, file) => total + file.loc, 0),
    testDeclarations: perFile.reduce((total, file) => total + file.testDeclarations, 0),
    mockSignals: perFile.reduce((total, file) => total + file.mockSignals, 0),
    textAssertionSignals: perFile.reduce((total, file) => total + file.textAssertionSignals, 0),
    environments,
    runtimeMs: null,
    perFile,
  };
}

function largestFiles(metrics, limit = 20) {
  return [...metrics.perFile].sort((left, right) => right.loc - left.loc || left.path.localeCompare(right.path)).slice(0, limit);
}

export function formatText(metrics) {
  return [
    'Test advisory (heuristic signals only; no KEEP/REWRITE/MERGE/DELETE recommendations)',
    `Test files: ${metrics.testFileCount}`,
    `Test LOC: ${metrics.testLoc}`,
    `Test declarations: ${metrics.testDeclarations}`,
    `Mock signals (advisory): ${metrics.mockSignals}`,
    `Text-assertion signals (advisory): ${metrics.textAssertionSignals}`,
    `Environments (advisory): ${Object.entries(metrics.environments).map(([name, total]) => `${name}=${total}`).join(', ')}`,
    `Runtime: ${metrics.runtimeMs === null ? 'not-measured' : `${metrics.runtimeMs} ms`}`,
    'Largest test files (physical LOC; advisory):',
    ...largestFiles(metrics).map((file) => `- ${file.path}: ${file.loc}`),
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
    `| Environments (advisory) | ${Object.entries(metrics.environments).map(([name, total]) => `${name}=${total}`).join(', ')} |`,
    `| Runtime | ${metrics.runtimeMs === null ? 'not-measured' : `${metrics.runtimeMs} ms`} |`,
    '',
    '### Largest test files (physical LOC; advisory)',
    ...largestFiles(metrics).map((file) => `- \`${file.path}\`: ${file.loc}`),
  ].join('\n');
}

export function formatOutput(metrics, format = 'text') {
  if (format === 'json') return JSON.stringify(metrics, null, 2);
  if (format === 'github') return formatGithubSummary(metrics);
  return formatText(metrics);
}

export async function discoverTrackedTestFiles(repoRoot) {
  const { stdout } = await execFileAsync('git', ['-C', repoRoot, 'ls-files', '-z', '--'], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  const selected = selectTestFiles(stdout.split('\0').filter(Boolean));
  return Promise.all(selected.map(async (filePath) => ({
    path: filePath,
    content: await fs.readFile(path.join(repoRoot, filePath), 'utf8'),
  })));
}

export async function collectMetrics(repoRoot) {
  return analyzeFiles(await discoverTrackedTestFiles(repoRoot));
}

async function collectMetricsWithRuntime(repoRoot) {
  const metrics = await collectMetrics(repoRoot);
  const start = performance.now();
  await new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['test'], { cwd: repoRoot, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`pnpm test failed (${signal ?? code})`));
    });
  });
  metrics.runtimeMs = Math.round(performance.now() - start);
  return metrics;
}

async function main(argv) {
  const formatArgument = argv.find((argument) => argument.startsWith('--format='));
  let format = formatArgument?.slice('--format='.length) ?? 'text';
  if (argv.includes('--json')) format = 'json';
  if (argv.includes('--github')) format = 'github';
  const rootArgument = argv.find((argument) => argument.startsWith('--root='));
  const repoRoot = rootArgument ? path.resolve(rootArgument.slice('--root='.length)) : REPO_ROOT;
  const metrics = argv.includes('--runtime')
    ? await collectMetricsWithRuntime(repoRoot)
    : await collectMetrics(repoRoot);
  process.stdout.write(`${formatOutput(metrics, format)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
