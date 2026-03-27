import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function removeWorktree(workspacePath: string, worktreePath: string): Promise<void> {
  try {
    await execFileAsync('git', ['worktree', 'remove', worktreePath, '--force'], {
      cwd: workspacePath,
      timeout: 15_000,
    });
  } catch {
    await fs.rm(worktreePath, { recursive: true, force: true });
  } finally {
    await execFileAsync('git', ['worktree', 'prune'], {
      cwd: workspacePath,
      timeout: 10_000,
    }).catch(() => {});
  }
}
