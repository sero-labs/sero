/**
 * Workspace-root dirty preflight for the Orchestrator (workspace-root mode).
 *
 * Reports whether the registered workspace root has uncommitted changes
 * (ignoring Sero-managed paths under `.sero/`), and stashes current changes
 * after an explicit user choice. These are placement/preflight operations, not
 * generated workflow steps.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import type {
  AppRuntimeDirtyWorkspaceStashResult,
  AppRuntimeWorkspaceStatusResult,
} from '@sero-ai/common';
import { extractStatusPath, isIgnoredWorkspaceStatusPath } from './workspace-sync';

const execFileAsync = promisify(execFile);

async function isGitRepository(workspacePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: workspacePath,
      timeout: 10_000,
    });
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

async function meaningfulStatusPaths(workspacePath: string): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: workspacePath,
    timeout: 15_000,
  });
  return stdout
    .split('\n')
    .map(extractStatusPath)
    .filter((relPath): relPath is string => !!relPath)
    .filter((relPath) => !isIgnoredWorkspaceStatusPath(relPath));
}

export async function getWorkspaceStatus(workspacePath: string): Promise<AppRuntimeWorkspaceStatusResult> {
  if (!(await isGitRepository(workspacePath))) {
    return { isGitRepository: false, hasUncommittedChanges: false, summary: 'Not a git repository' };
  }
  const paths = await meaningfulStatusPaths(workspacePath);
  return {
    isGitRepository: true,
    hasUncommittedChanges: paths.length > 0,
    summary: paths.length > 0 ? `${paths.length} uncommitted change(s)` : 'Clean working tree',
  };
}

export async function stashWorkspaceChanges(
  workspacePath: string,
  message: string,
): Promise<AppRuntimeDirtyWorkspaceStashResult> {
  await execFileAsync('git', ['stash', 'push', '--include-untracked', '-m', message], {
    cwd: workspacePath,
    timeout: 30_000,
  });
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'stash@{0}'], {
      cwd: workspacePath,
      timeout: 10_000,
    });
    return { stashRef: stdout.trim() || null };
  } catch {
    return { stashRef: null };
  }
}
