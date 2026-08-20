import { spawn } from 'node:child_process';

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
  /**
   * What to do when a process passes `maxOutputBytes`.
   *
   * `kill` suits short probes, where runaway output means something is wrong.
   * `truncate` keeps only the tail and lets the process finish — the only safe
   * choice for a command that has already spent money, because killing it
   * throws the paid result away and the failure then looks like a build that
   * never ran.
   */
  onOutputLimit?: 'kill' | 'truncate';
  /** Called with each complete stdout line as it arrives (progress streaming). */
  onLine?: (line: string) => void;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** True when output was trimmed to the tail rather than kept whole. */
  truncated: boolean;
}

export const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576; // 1 MiB
export const JSON_MAX_OUTPUT_BYTES = 2_097_152; // 2 MiB
/** A long extract streams a lot of progress; keep enough tail to diagnose it. */
export const BUILD_MAX_OUTPUT_BYTES = 4_194_304; // 4 MiB
export const OUTPUT_LIMIT_EXIT_CODE = 125;
export const TIMEOUT_EXIT_CODE = 124;

/** Spawn with hard output/time bounds. Never throws; failures land in exitCode/stderr. */
export function boundedExec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
  const {
    cwd,
    env,
    timeoutMs = 10 * 60_000,
    maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
    onOutputLimit = 'kill',
    onLine,
  } = options;

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let bytes = 0;
    let finished = false;
    let limitHit = false;
    let truncated = false;
    let timedOut = false;
    let lineBuffer = '';

    const emitLines = (chunk: string) => {
      if (!onLine) return;
      lineBuffer += chunk;
      let newline = lineBuffer.indexOf('\n');
      while (newline !== -1) {
        const line = lineBuffer.slice(0, newline);
        lineBuffer = lineBuffer.slice(newline + 1);
        if (line.trim()) {
          try {
            onLine(line);
          } catch {
            // Progress callbacks must never break the exec.
          }
        }
        newline = lineBuffer.indexOf('\n');
      }
    };

    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    const collect = (target: 'stdout' | 'stderr') => (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (onOutputLimit === 'kill') {
        bytes += chunk.length;
        if (bytes > maxOutputBytes) {
          if (!limitHit) {
            limitHit = true;
            child.kill('SIGKILL');
          }
          return;
        }
      }
      if (target === 'stdout') {
        stdout += text;
        if (stdout.length > maxOutputBytes) {
          stdout = stdout.slice(-maxOutputBytes);
          truncated = true;
        }
        emitLines(text);
      } else {
        stderr += text;
        if (stderr.length > maxOutputBytes) {
          stderr = stderr.slice(-maxOutputBytes);
          truncated = true;
        }
      }
    };

    const finish = (exitCode: number, extraStderr?: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (extraStderr) stderr += (stderr ? '\n' : '') + extraStderr;
      resolve({ stdout, stderr, exitCode, truncated });
    };

    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));
    child.on('error', (error) => finish(127, String(error)));
    child.on('close', (code, signal) => {
      if (limitHit) return finish(OUTPUT_LIMIT_EXIT_CODE, `Output exceeded ${maxOutputBytes} bytes; process killed.`);
      if (timedOut) return finish(TIMEOUT_EXIT_CODE, `Timed out after ${timeoutMs}ms; process killed.`);
      if (signal) return finish(1, `Process killed by signal ${signal}.`);
      finish(code ?? 1);
    });
  });
}

export type ExecFn = typeof boundedExec;
