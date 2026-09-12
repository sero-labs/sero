import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { compactCapture } from '../extension/compaction';
import { detectCategory, type OutputCategory } from '../extension/compaction/category';
import { preservesProtectedContent } from '../extension/compaction/preservation';
import { buildPreview } from '../extension/preview';

/**
 * Bench harness for the categories the plugin compacts.
 *
 * A bench harness is a measurement script. It runs each tool for real, captures
 * that tool's output, runs the plugin's compaction on it, and reports the byte
 * counts, estimated tokens and compaction time. It fails when a diagnostic was
 * lost before presentation.
 *
 * The heavy cases (Playwright, the Electron build, `pnpm install`) only run when
 * `BENCH_HEAVY=1`, so the default run stays fast.
 */

const pluginRoot = path.resolve(__dirname, '..');
const monorepoRoot = path.resolve(pluginRoot, '../..');
const includeHeavy = process.env.BENCH_HEAVY === '1';

interface BenchCase {
  name: string;
  tool: string;
  variant: 'success' | 'failure';
  command: string;
  args: string[];
  cwd: string;
  /** Override category detection when the command is a wrapper. */
  category?: OutputCategory;
  heavy?: boolean;
}

/** Write a throwaway project with one type error, for the tsc failure case. */
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
  {
    name: 'vitest pass',
    tool: 'vitest',
    variant: 'success',
    command: 'pnpm',
    args: ['exec', 'vitest', 'run', 'extension/__tests__/parse.test.ts'],
    cwd: pluginRoot,
  },
  {
    name: 'vitest fail',
    tool: 'vitest',
    variant: 'failure',
    command: 'pnpm',
    args: ['exec', 'vitest', 'run', 'bench/fixtures/missing.test.ts'],
    cwd: pluginRoot,
  },
  {
    name: 'tsc pass',
    tool: 'tsc',
    variant: 'success',
    command: 'pnpm',
    args: ['exec', 'tsc', '--noEmit', '-p', 'extension/tsconfig.json'],
    cwd: pluginRoot,
    category: 'build',
  },
  {
    name: 'tsc fail',
    tool: 'tsc',
    variant: 'failure',
    command: 'pnpm',
    args: brokenTypeScript.args,
    cwd: brokenTypeScript.cwd,
    category: 'build',
  },
  {
    name: 'git status',
    tool: 'git',
    variant: 'success',
    command: 'git',
    args: ['status', '--porcelain=v1'],
    cwd: monorepoRoot,
    category: 'git',
  },
  {
    name: 'git log',
    tool: 'git',
    variant: 'success',
    command: 'git',
    args: ['log', '-n', '5'],
    cwd: monorepoRoot,
    category: 'git',
  },
  {
    name: 'git diff',
    tool: 'git',
    variant: 'failure',
    command: 'git',
    args: ['diff', '--definitely-not-a-flag'],
    cwd: monorepoRoot,
    category: 'git',
  },
  {
    name: 'eslint',
    tool: 'eslint',
    variant: 'success',
    command: 'pnpm',
    args: ['exec', 'eslint', 'extension/shell.ts'],
    cwd: pluginRoot,
    category: 'lint',
  },
  {
    name: 'pnpm install',
    tool: 'pnpm install',
    variant: 'success',
    command: 'pnpm',
    args: ['install', '--frozen-lockfile'],
    cwd: monorepoRoot,
    category: 'packageManager',
    heavy: true,
  },
  {
    name: 'playwright',
    tool: 'playwright',
    variant: 'success',
    command: 'pnpm',
    args: ['exec', 'playwright', 'test', '--list'],
    cwd: path.join(monorepoRoot, 'apps/desktop'),
    heavy: true,
  },
  {
    name: 'electron build',
    tool: 'electron build',
    variant: 'success',
    command: 'pnpm',
    args: ['run', 'build:electron'],
    cwd: path.join(monorepoRoot, 'apps/desktop'),
    category: 'build',
    heavy: true,
  },
];

interface BenchRow {
  name: string;
  tool: string;
  variant: string;
  category: OutputCategory;
  exitCode: number;
  inputBytes: number;
  candidateBytes: number;
  previewBytes: number;
  estimatedTokens: number;
  latencyMs: number;
  removedPercent: number;
  truncated: boolean;
  preserved: boolean;
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
  const outcome = compactCapture(output, category);
  const preview = buildPreview(outcome.candidate);
  const latencyMs = Number(process.hrtime.bigint() - compactionStarted) / 1_000_000;

  const candidateBytes = Buffer.byteLength(outcome.candidate, 'utf8');
  const previewBytes = Buffer.byteLength(preview.content, 'utf8');
  const removed = inputBytes === 0 ? 0 : ((inputBytes - candidateBytes) / inputBytes) * 100;

  return {
    name: benchCase.name,
    tool: benchCase.tool,
    variant: benchCase.variant,
    category,
    exitCode: result.status ?? -1,
    inputBytes,
    candidateBytes,
    previewBytes,
    estimatedTokens: Math.ceil(previewBytes / 4),
    latencyMs: Math.round(latencyMs * 1000) / 1000,
    removedPercent: Math.round(removed * 10) / 10,
    truncated: preview.truncated,
    preserved: preservesProtectedContent(output, outcome.candidate, category),
  };
}

describe('output optimizer bench harness', () => {
  const selected = cases.filter((benchCase) => includeHeavy || !benchCase.heavy);

  it('reports bytes, tokens and latency for every case, and preserves diagnostics', () => {
    const rows = selected.map(runCase);
    const header = [
      'name'.padEnd(18),
      'tool'.padEnd(14),
      'variant'.padEnd(9),
      'category'.padEnd(15),
      'exit'.padEnd(5),
      'input'.padStart(8),
      'candidate'.padStart(10),
      'preview'.padStart(9),
      '~tokens'.padStart(8),
      'ms'.padStart(8),
      'removed'.padStart(8),
      'kept'.padStart(5),
    ].join(' ');
    const lines = rows.map((row) => [
      row.name.padEnd(18),
      row.tool.padEnd(14),
      row.variant.padEnd(9),
      row.category.padEnd(15),
      String(row.exitCode).padEnd(5),
      String(row.inputBytes).padStart(8),
      String(row.candidateBytes).padStart(10),
      String(row.previewBytes).padStart(9),
      String(row.estimatedTokens).padStart(8),
      String(row.latencyMs).padStart(8),
      `${row.removedPercent}%`.padStart(8),
      String(row.preserved).padStart(5),
    ].join(' '));
    console.log(`\n${header}\n${lines.join('\n')}\n`);

    for (const row of rows) {
      expect(row.preserved, `${row.name} lost protected content before presentation`).toBe(true);
    }
  });
});
