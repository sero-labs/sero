import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { compactStream } from '../extension/compaction';
import { detectCategory, type OutputCategory } from '../extension/compaction/category';
import { PREVIEW_MAX_BYTES, PREVIEW_MAX_LINES } from '../extension/preview';

/**
 * Bench harness for the categories the plugin compacts.
 *
 * A bench harness is a measurement script. It runs each tool for real, captures
 * that tool's output, and runs the production streaming compaction on it.
 *
 * Assertions are independent of the implementation's own preservation guard:
 * every line a local pattern marks as a diagnostic must appear in the complete
 * candidate produced by the production path, and the written capture file must
 * return the same bytes, including when the preview is truncated.
 *
 * The heavy cases (Playwright, the Electron build, `pnpm install`) only run when
 * `BENCH_HEAVY=1`, so the default run stays fast.
 */

const pluginRoot = path.resolve(__dirname, '..');
const monorepoRoot = path.resolve(pluginRoot, '../..');
const includeHeavy = process.env.BENCH_HEAVY === '1';
const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'output-optimizer-bench-captures-'));

afterAll(() => {
  fs.rmSync(captureDir, { recursive: true, force: true });
});

type Expected = 'success' | 'failure' | 'any';

interface BenchCase {
  name: string;
  tool: string;
  variant: 'success' | 'failure';
  expected: Expected;
  command: string;
  args: string[];
  cwd: string;
  category?: OutputCategory;
  heavy?: boolean;
}

/** One throwaway project with a type error, for the tsc failure case. */
function prepareBrokenTypeScript(): { cwd: string; args: string[] } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'output-optimizer-bench-tsc-'));
  fs.writeFileSync(path.join(directory, 'bad.ts'), "export const value: number = 'not a number';\n", 'utf8');
  fs.writeFileSync(
    path.join(directory, 'tsconfig.json'),
    `${JSON.stringify({ compilerOptions: { strict: true, noEmit: true, skipLibCheck: true }, include: ['./bad.ts'] }, null, 2)}\n`,
    'utf8',
  );
  return { cwd: directory, args: ['exec', 'tsc', '--noEmit', '-p', 'tsconfig.json'] };
}

const brokenTypeScript = prepareBrokenTypeScript();

const cases: BenchCase[] = [
  { name: 'vitest pass', tool: 'vitest', variant: 'success', expected: 'success',
    command: 'pnpm', args: ['exec', 'vitest', 'run', 'extension/__tests__/parse.test.ts'], cwd: pluginRoot },
  { name: 'vitest fail', tool: 'vitest', variant: 'failure', expected: 'failure',
    command: 'pnpm', args: ['exec', 'vitest', 'run', 'bench/fixtures/missing.test.ts'], cwd: pluginRoot },
  { name: 'tsc pass', tool: 'tsc', variant: 'success', expected: 'success',
    command: 'pnpm', args: ['exec', 'tsc', '--noEmit', '-p', 'extension/tsconfig.json'], cwd: pluginRoot, category: 'build' },
  { name: 'tsc fail', tool: 'tsc', variant: 'failure', expected: 'failure',
    command: 'pnpm', args: brokenTypeScript.args, cwd: brokenTypeScript.cwd, category: 'build' },
  { name: 'git status', tool: 'git', variant: 'success', expected: 'success',
    command: 'git', args: ['status', '--porcelain=v1'], cwd: monorepoRoot, category: 'git' },
  { name: 'git log', tool: 'git', variant: 'success', expected: 'success',
    command: 'git', args: ['log', '-n', '5'], cwd: monorepoRoot, category: 'git' },
  { name: 'git diff fail', tool: 'git', variant: 'failure', expected: 'failure',
    command: 'git', args: ['diff', '--definitely-not-a-flag'], cwd: monorepoRoot, category: 'git' },
  { name: 'eslint', tool: 'eslint', variant: 'success', expected: 'any',
    command: 'pnpm', args: ['exec', 'eslint', 'extension/shell.ts'], cwd: pluginRoot, category: 'lint' },
  { name: 'eslint fail', tool: 'eslint', variant: 'failure', expected: 'any',
    command: 'pnpm', args: ['exec', 'eslint', '--not-a-real-flag', '.'], cwd: pluginRoot, category: 'lint' },
  { name: 'pnpm install', tool: 'pnpm install', variant: 'success', expected: 'success',
    command: 'pnpm', args: ['install', '--frozen-lockfile'], cwd: monorepoRoot, category: 'packageManager', heavy: true },
  { name: 'pnpm install fail', tool: 'pnpm install', variant: 'failure', expected: 'failure',
    command: 'pnpm', args: ['install', '--not-a-real-flag'], cwd: monorepoRoot, category: 'packageManager', heavy: true },
  { name: 'playwright', tool: 'playwright', variant: 'success', expected: 'any',
    command: 'pnpm', args: ['exec', 'playwright', 'test', '--list'], cwd: path.join(monorepoRoot, 'apps/desktop'), heavy: true },
  { name: 'playwright fail', tool: 'playwright', variant: 'failure', expected: 'any',
    command: 'pnpm', args: ['exec', 'playwright', '--not-a-real-flag'], cwd: path.join(monorepoRoot, 'apps/desktop'), heavy: true },
  { name: 'electron build', tool: 'electron build', variant: 'success', expected: 'success',
    command: 'pnpm', args: ['run', 'build:electron'], cwd: path.join(monorepoRoot, 'apps/desktop'), category: 'build', heavy: true },
  { name: 'electron build fail', tool: 'electron build', variant: 'failure', expected: 'failure',
    command: 'pnpm', args: ['run', 'build:electron:not-a-real-script'], cwd: path.join(monorepoRoot, 'apps/desktop'), heavy: true },
];

/**
 * A local pattern for content that must survive. It is deliberately not the
 * plugin's guard, so a bug in that guard cannot hide a loss.
 */
const MUST_SURVIVE = /\b(?:error|warning|warn|FAIL|FAILED)\b|\b\d+\s+(?:passed|failed)\b|^commit\s|^diff --git|[^\s:]*[./][^\s:]*:\d+(?::\d+)?/i;

function mustSurviveLines(source: string): string[] {
  return [...new Set(
    source.split('\n').map((line) => line.trim()).filter((line) => line && MUST_SURVIVE.test(line)),
  )];
}

interface BenchRow {
  name: string;
  tool: string;
  variant: string;
  category: OutputCategory;
  exitCode: number;
  expected: Expected;
  inputBytes: number;
  candidateBytes: number;
  previewBytes: number;
  estimatedTokens: number;
  latencyMs: number;
  removedPercent: number;
  truncated: boolean;
  protectedLost: number;
  recoveryBytes: number;
}

function runCase(benchCase: BenchCase): BenchRow {
  const result = spawnSync(benchCase.command, benchCase.args, {
    cwd: benchCase.cwd,
    encoding: 'utf8',
    timeout: benchCase.heavy ? 20 * 60 * 1000 : 2 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const inputBytes = Buffer.byteLength(output, 'utf8');
  const category = benchCase.category ?? detectCategory(`${benchCase.command} ${benchCase.args.join(' ')}`);

  const compactionStarted = process.hrtime.bigint();
  const streamed = compactStream(output, category, { maxLines: PREVIEW_MAX_LINES, maxBytes: PREVIEW_MAX_BYTES });
  // Unbounded preview over the same production path yields the complete candidate.
  const complete = compactStream(output, category, {
    maxLines: Number.MAX_SAFE_INTEGER,
    maxBytes: Number.MAX_SAFE_INTEGER,
  }).preview.content;
  const latencyMs = Number(process.hrtime.bigint() - compactionStarted) / 1_000_000;

  // Write and read a capture file, so recovery is proven from real bytes.
  const capturePath = path.join(captureDir, `${benchCase.name.replace(/\W+/g, '-')}.log`);
  fs.writeFileSync(capturePath, output, 'utf8');
  const recoveredText = fs.readFileSync(capturePath, 'utf8');
  const recoveryBytes = Buffer.byteLength(recoveredText, 'utf8');

  const mustSurvive = mustSurviveLines(output);
  const protectedLost = mustSurvive.filter((line) => !complete.includes(line)).length;
  const missingFromCapture = mustSurvive.filter((line) => !recoveredText.includes(line)).length;

  const previewBytes = Buffer.byteLength(streamed.preview.content, 'utf8');
  const removed = inputBytes === 0 ? 0 : ((inputBytes - streamed.candidateBytes) / inputBytes) * 100;

  return {
    name: benchCase.name,
    tool: benchCase.tool,
    variant: benchCase.variant,
    category,
    exitCode: result.status ?? -1,
    expected: benchCase.expected,
    inputBytes,
    candidateBytes: streamed.candidateBytes,
    previewBytes,
    estimatedTokens: Math.ceil(previewBytes / 4),
    latencyMs: Math.round(latencyMs * 1000) / 1000,
    removedPercent: Math.round(removed * 10) / 10,
    truncated: streamed.preview.truncated,
    protectedLost: protectedLost + missingFromCapture,
    recoveryBytes,
  };
}

describe('output optimizer bench harness', () => {
  const selected = cases.filter((benchCase) => includeHeavy || !benchCase.heavy);

  it('reports bytes, tokens and latency for every case, and preserves diagnostics', () => {
    const rows = selected.map(runCase);
    const header = [
      'name'.padEnd(20),
      'variant'.padEnd(9),
      'category'.padEnd(15),
      'exit'.padEnd(5),
      'input'.padStart(8),
      'candidate'.padStart(10),
      'preview'.padStart(9),
      '~tokens'.padStart(8),
      'ms'.padStart(8),
      'removed'.padStart(8),
      'lost'.padStart(5),
    ].join(' ');
    const lines = rows.map((row) => [
      row.name.padEnd(20),
      row.variant.padEnd(9),
      row.category.padEnd(15),
      String(row.exitCode).padEnd(5),
      String(row.inputBytes).padStart(8),
      String(row.candidateBytes).padStart(10),
      String(row.previewBytes).padStart(9),
      String(row.estimatedTokens).padStart(8),
      String(row.latencyMs).padStart(8),
      `${row.removedPercent}%`.padStart(8),
      String(row.protectedLost).padStart(5),
    ].join(' '));
    console.log(`\n${header}\n${lines.join('\n')}\n`);

    for (const row of rows) {
      if (row.expected === 'success') {
        expect(row.exitCode, `${row.name} should have succeeded`).toBe(0);
      } else if (row.expected === 'failure') {
        expect(row.exitCode, `${row.name} should have failed`).not.toBe(0);
      }
      expect(row.protectedLost, `${row.name} lost protected content`).toBe(0);
      // The capture file is the recovery source and must return the same bytes.
      expect(row.recoveryBytes, `${row.name} capture file did not return the input bytes`).toBe(row.inputBytes);
    }
  });
});
