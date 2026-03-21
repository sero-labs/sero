import { execFileSync } from 'node:child_process';

interface RunGitOptions {
  timeout?: number;
  maxBuffer?: number;
  allowFailure?: boolean;
  trim?: boolean;
}

export function runGit(
  args: string[],
  cwd: string,
  {
    timeout = 15_000,
    maxBuffer = 10 * 1024 * 1024,
    allowFailure = false,
    trim = true,
  }: RunGitOptions = {},
): string {
  try {
    const output = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout,
      maxBuffer,
    });

    return trim ? output.trim() : output;
  } catch (error) {
    if (allowFailure) return '';
    throw error;
  }
}
