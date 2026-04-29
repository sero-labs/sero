import { runGit } from './git-exec';
import type { FileChangeStatus } from '../shared/types';

export function git(args: string[], cwd: string): string {
  return runGit(args, cwd, { allowFailure: true });
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
    case 'U':
      return 'modified';
    default:
      return null;
  }
}
