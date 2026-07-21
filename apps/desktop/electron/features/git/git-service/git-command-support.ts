import { runGitAsync } from './git-exec';
import type { FileChangeStatus } from '@sero-ai/common';

export function git(args: string[], cwd: string): Promise<string> {
  return runGitAsync(args, cwd, { allowFailure: true });
}

export function nonEmpty(line: string): boolean {
  return line.trim().length > 0;
}

export function parseStatusChar(code: string): FileChangeStatus | null {
  switch (code) {
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    case '?':
      return 'untracked';
    case 'M':
    case 'T':
      return 'modified';
    case 'U':
      return 'conflict';
    default:
      return null;
  }
}
