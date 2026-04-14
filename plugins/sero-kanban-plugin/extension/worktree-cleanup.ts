import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function formatErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function removeWorktree(
  workspacePath: string,
  worktreePath: string,
): Promise<string[]> {
  const warnings: string[] = [];

  try {
    await execFileAsync('git', ['worktree', 'remove', worktreePath, '--force'], {
      cwd: workspacePath,
      timeout: 15_000,
    });
  } catch (error) {
    warnings.push(
      `git worktree remove failed for ${worktreePath}; falling back to direct deletion (${formatErrorDetail(error)})`,
    );
    try {
      await fs.rm(worktreePath, { recursive: true, force: true });
    } catch (fallbackError) {
      warnings.push(
        `Direct worktree cleanup also failed for ${worktreePath}: ${formatErrorDetail(fallbackError)}`,
      );
    }
  }

  try {
    await execFileAsync('git', ['worktree', 'prune'], {
      cwd: workspacePath,
      timeout: 10_000,
    });
  } catch (error) {
    warnings.push(`git worktree prune failed: ${formatErrorDetail(error)}`);
  }

  return warnings;
}
