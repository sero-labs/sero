/**
 * Verification command detection and execution.
 *
 * Auto-detects project-appropriate verification commands (typecheck, tests, etc.)
 * from workspace files. Zero-config — just point it at a workspace.
 */

import { promises as fs, readdirSync } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ── Detection ────────────────────────────────────────────────

/**
 * Detect the package manager used in a workspace.
 */
export function detectPackageManager(workspacePath: string): 'pnpm' | 'npm' | 'yarn' {
  try {
    // Synchronous check is fine for detection — called once per card
    const files = readdirSync(workspacePath);
    if (files.includes('pnpm-lock.yaml') || files.includes('pnpm-workspace.yaml')) return 'pnpm';
    if (files.includes('yarn.lock')) return 'yarn';
  } catch {
    // Fall through to default
  }
  return 'npm';
}

interface DetectOptions {
  /** When false, exclude test commands (POC mode) */
  testingEnabled?: boolean;
}

/**
 * Auto-detect verification commands from workspace project files.
 * Returns an ordered list of commands to run (typecheck first, then tests).
 */
export async function detectVerificationCommands(
  workspacePath: string,
  options?: DetectOptions,
): Promise<string[]> {
  const commands: string[] = [];
  const testingEnabled = options?.testingEnabled !== false;
  const pm = detectPackageManager(workspacePath);

  // Read package.json once for script checks
  const pkg = await readPackageJson(workspacePath);

  // TypeScript → only if a typecheck script actually exists in package.json
  if (await fileExists(path.join(workspacePath, 'tsconfig.json'))) {
    if (pkg?.scripts?.typecheck) {
      commands.push(`${pm} run typecheck`);
    } else if (pkg?.scripts?.['type-check']) {
      commands.push(`${pm} run type-check`);
    }
    // No typecheck script → skip (don't assume `tsc --noEmit` is available)
  }

  if (testingEnabled) {
    // Node project with test script
    if (pkg?.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
      commands.push(`${pm} test`);
    }

    // Cargo project → cargo check + cargo test
    if (await fileExists(path.join(workspacePath, 'Cargo.toml'))) {
      commands.push('cargo check', 'cargo test');
    }

    // Python project
    if (
      await fileExists(path.join(workspacePath, 'pyproject.toml'))
      || await fileExists(path.join(workspacePath, 'setup.py'))
    ) {
      commands.push('pytest');
    }
  }

  return commands;
}

// ── Execution ────────────────────────────────────────────────

export interface VerificationResult {
  success: boolean;
  /** Results per command */
  results: CommandResult[];
}

export interface CommandResult {
  command: string;
  success: boolean;
  stdout: string;
  stderr: string;
  /** Elapsed time in ms */
  durationMs: number;
}

/**
 * Run verification commands sequentially. Stops on first failure.
 */
export async function runVerificationCommands(
  cwd: string,
  commands: string[],
  timeoutMs = 120_000,
): Promise<VerificationResult> {
  const results: CommandResult[] = [];

  for (const cmd of commands) {
    const start = Date.now();
    try {
      const { stdout, stderr } = await execFileAsync(
        'sh', ['-c', cmd],
        { cwd, timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 },
      );
      results.push({
        command: cmd,
        success: true,
        stdout: stdout.slice(-4000),
        stderr: stderr.slice(-2000),
        durationMs: Date.now() - start,
      });
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string };
      results.push({
        command: cmd,
        success: false,
        stdout: (execErr.stdout ?? '').slice(-4000),
        stderr: (execErr.stderr ?? '').slice(-2000),
        durationMs: Date.now() - start,
      });
      // Stop on first failure
      return { success: false, results };
    }
  }

  return { success: true, results };
}

// ── Helpers ──────────────────────────────────────────────────

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readPackageJson(
  dir: string,
): Promise<{ scripts?: Record<string, string> } | null> {
  try {
    const raw = await fs.readFile(path.join(dir, 'package.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
