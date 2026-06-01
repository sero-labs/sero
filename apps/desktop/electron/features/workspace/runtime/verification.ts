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
 * Detect the compile/build command that best fits a workspace for smoke review.
 * Prefers typecheck scripts when present, otherwise falls back to build.
 */
export async function detectCompileCommands(workspacePath: string): Promise<string[]> {
  const commands: string[] = [];
  const pm = detectPackageManager(workspacePath);
  const pkg = await readPackageJson(workspacePath);

  if (await fileExists(path.join(workspacePath, 'tsconfig.json'))) {
    if (pkg?.scripts?.typecheck) {
      commands.push(`${pm} run typecheck`);
    } else if (pkg?.scripts?.['type-check']) {
      commands.push(`${pm} run type-check`);
    }
  }

  if (commands.length === 0 && pkg?.scripts?.build) {
    commands.push(`${pm} run build`);
  }

  if (commands.length === 0 && await fileExists(path.join(workspacePath, 'Cargo.toml'))) {
    commands.push('cargo check');
  }

  return commands;
}

/**
 * Detect the safest dependency install command for a Node workspace.
 * Returns null when the workspace doesn't look like a package-managed Node project.
 */
export async function detectDependencyInstallCommand(workspacePath: string): Promise<string | null> {
  const hasPackageJson = await fileExists(path.join(workspacePath, 'package.json'));
  if (!hasPackageJson) return null;

  const pm = detectPackageManager(workspacePath);
  if (pm === 'pnpm') {
    return await fileExists(path.join(workspacePath, 'pnpm-lock.yaml'))
      ? 'pnpm install --frozen-lockfile'
      : 'pnpm install';
  }

  if (pm === 'yarn') {
    return await fileExists(path.join(workspacePath, 'yarn.lock'))
      ? 'yarn install --frozen-lockfile'
      : 'yarn install';
  }

  const hasNpmLock = await fileExists(path.join(workspacePath, 'package-lock.json'))
    || await fileExists(path.join(workspacePath, 'npm-shrinkwrap.json'));
  return hasNpmLock ? 'npm ci' : 'npm install';
}

/**
 * Detect the best dev-server startup command for smoke review.
 */
export async function detectDevServerCommand(workspacePath: string): Promise<string | null> {
  const pm = detectPackageManager(workspacePath);
  const pkg = await readPackageJson(workspacePath);
  return pkg?.scripts?.dev ? `${pm} run dev` : null;
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

export interface VerificationCommandRunner {
  (command: string, cwd: string, timeoutMs: number): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
}

interface RunVerificationOptions {
  runCommand?: VerificationCommandRunner;
}

/**
 * Run verification commands sequentially. Stops on first failure.
 */
export async function runVerificationCommands(
  cwd: string,
  commands: string[],
  timeoutMs = 120_000,
  options?: RunVerificationOptions,
): Promise<VerificationResult> {
  const runCommand = options?.runCommand ?? runHostCommand;
  const results = await Promise.all(commands.map(async (cmd): Promise<CommandResult> => {
    const start = Date.now();
    try {
      const { stdout, stderr, exitCode } = await runCommand(cmd, cwd, timeoutMs);
      return {
        command: cmd,
        success: exitCode === 0,
        stdout: stdout.slice(-4000),
        stderr: stderr.slice(-2000),
        durationMs: Date.now() - start,
      };
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string };
      return {
        command: cmd,
        success: false,
        stdout: (execErr.stdout ?? '').slice(-4000),
        stderr: (execErr.stderr ?? '').slice(-2000),
        durationMs: Date.now() - start,
      };
    }
  }));

  const firstFailureIndex = results.findIndex((result) => !result.success);
  return firstFailureIndex === -1
    ? { success: true, results }
    : { success: false, results: results.slice(0, firstFailureIndex + 1) };
}

interface RunDevServerSmokeOptions {
  runCommand?: VerificationCommandRunner;
  startupTimeoutMs?: number;
}

/**
 * Run a dev server command long enough to catch immediate startup failures.
 * A timeout is treated as success because the server stayed alive.
 */
export async function runDevServerSmokeCheck(
  cwd: string,
  command: string,
  options?: RunDevServerSmokeOptions,
): Promise<CommandResult> {
  const start = Date.now();
  const runCommand = options?.runCommand ?? runHostCommand;
  const startupTimeoutMs = options?.startupTimeoutMs ?? 20_000;

  try {
    const { stdout, stderr, exitCode } = await runCommand(command, cwd, startupTimeoutMs);
    return {
      command,
      success: exitCode === 0 || looksLikeCommandTimeout(exitCode, stderr),
      stdout: stdout.slice(-4000),
      stderr: stderr.slice(-2000),
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const execErr = err as { code?: number | string; stdout?: string; stderr?: string; message?: string };
    const stderr = String(execErr.stderr ?? execErr.message ?? '');
    const exitCode = typeof execErr.code === 'number' ? execErr.code : undefined;
    return {
      command,
      success: looksLikeCommandTimeout(exitCode, stderr),
      stdout: String(execErr.stdout ?? '').slice(-4000),
      stderr: stderr.slice(-2000),
      durationMs: Date.now() - start,
    };
  }
}

export function summarizeVerificationFailure(result: CommandResult): string {
  const output = sanitizeVerificationOutput(`${result.stderr}\n${result.stdout}`.trim());
  if (looksLikeNativeDependencyMismatch(output)) {
    return `${result.command}: native dependency mismatch between verification and installed dependencies. Run verification in the same workspace environment used for install/build.`;
  }
  return `${result.command}: ${output || 'command failed with no output'}`;
}

// ── Helpers ──────────────────────────────────────────────────

async function runHostCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { stdout, stderr } = await execFileAsync(
    'sh', ['-c', command],
    { cwd, timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 },
  );
  return { stdout, stderr, exitCode: 0 };
}

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

function sanitizeVerificationOutput(output: string): string {
  return output
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(-800);
}

function looksLikeNativeDependencyMismatch(output: string): boolean {
  return (
    output.includes('Cannot find native binding') ||
    (output.includes('MODULE_NOT_FOUND') && output.includes('@rolldown/binding-')) ||
    output.includes('optional dependencies') ||
    (output.includes('MODULE_NOT_FOUND') && output.includes('/node_modules/rolldown/'))
  );
}

function looksLikeCommandTimeout(exitCode: number | undefined, stderr: string): boolean {
  return exitCode === 124 || /timed out/i.test(stderr) || /ETIMEDOUT/i.test(stderr);
}
