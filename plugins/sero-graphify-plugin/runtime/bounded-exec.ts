import { spawn } from 'node:child_process';

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576; // 1 MiB
export const JSON_MAX_OUTPUT_BYTES = 2_097_152; // 2 MiB
export const OUTPUT_LIMIT_EXIT_CODE = 125;
export const TIMEOUT_EXIT_CODE = 124;

/** Spawn with hard output/time bounds. Never throws; failures land in exitCode/stderr. */
export function boundedExec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
  const { cwd, env, timeoutMs = 10 * 60_000, maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES } = options;

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let bytes = 0;
    let finished = false;
    let limitHit = false;
    let timedOut = false;

    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    const collect = (target: 'stdout' | 'stderr') => (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) {
        if (!limitHit) {
          limitHit = true;
          child.kill('SIGKILL');
        }
        return;
      }
      if (target === 'stdout') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
    };

    const finish = (exitCode: number, extraStderr?: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (extraStderr) stderr += (stderr ? '\n' : '') + extraStderr;
      resolve({ stdout, stderr, exitCode });
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
