/**
 * Helpers shared by built-in doctor checks.
 *
 * Each helper is dependency-free so the engine constraint
 * (no Electron, no native modules) holds.
 */

import { execFile } from 'child_process';
import type { DoctorCategory, DoctorResult, DoctorStatus } from '../types';

export interface ResultInit {
  id: string;
  category: DoctorCategory;
  status: DoctorStatus;
  message: string;
  fix?: DoctorResult['fix'];
  details?: Record<string, unknown>;
  start: number;
}

export function makeResult(init: ResultInit): DoctorResult {
  const result: DoctorResult = {
    id: init.id,
    category: init.category,
    status: init.status,
    message: init.message,
    durationMs: Math.max(0, Date.now() - init.start),
  };
  if (init.fix) result.fix = init.fix;
  if (init.details) result.details = init.details;
  return result;
}

export interface ExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
  error?: string;
}

export function runCommand(
  command: string,
  args: string[],
  options: { timeoutMs?: number; cwd?: string } = {},
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execFile(
      command,
      args,
      { timeout: options.timeoutMs ?? 5_000, cwd: options.cwd },
      (err, stdout, stderr) => {
        if (err) {
          resolve({
            ok: false,
            stdout: stdout?.toString() ?? '',
            stderr: stderr?.toString() ?? '',
            code: typeof (err as NodeJS.ErrnoException).code === 'number'
              ? (err as unknown as { code: number }).code
              : child.exitCode,
            error: err.message,
          });
          return;
        }
        resolve({
          ok: true,
          stdout: stdout?.toString() ?? '',
          stderr: stderr?.toString() ?? '',
          code: child.exitCode ?? 0,
        });
      },
    );
  });
}
