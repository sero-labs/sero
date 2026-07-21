import { execWorktreeGit } from './exec';

export interface GitRunner {
  run: (
    workspacePath: string,
    args: string[],
    timeoutMs?: number,
  ) => Promise<{ stdout: string; stderr: string }>;
}

const defaultGitRunner: GitRunner = {
  async run(workspacePath, args, timeoutMs = 30_000) {
    const result = await execWorktreeGit(args, {
      cwd: workspacePath,
      timeout: timeoutMs,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  },
};

export interface WorkspaceSyncResult {
  synced: boolean;
  branch?: string;
  headChanged?: boolean;
  reason?: string;
}

export async function resolvePreferredBaseRef(workspacePath: string): Promise<string | null> {
  await fetchOrigin(workspacePath, defaultGitRunner);

  const branch = await detectDefaultBranch(workspacePath, defaultGitRunner);
  if (!branch) return null;

  if (await refExists(workspacePath, `refs/remotes/origin/${branch}`, defaultGitRunner)) {
    return `origin/${branch}`;
  }
  if (await refExists(workspacePath, `refs/heads/${branch}`, defaultGitRunner)) {
    return branch;
  }

  return null;
}

export async function syncWorkspaceRootToDefaultBranch(
  workspacePath: string,
  runner: GitRunner = defaultGitRunner,
): Promise<WorkspaceSyncResult> {
  await fetchOrigin(workspacePath, runner);

  const branch = await detectDefaultBranch(workspacePath, runner);
  if (!branch) {
    return { synced: false, reason: 'No default branch detected.' };
  }

  const meaningfulPaths = await getMeaningfulWorkspaceStatusPaths(workspacePath, runner);
  if (meaningfulPaths.length > 0) {
    return {
      synced: false,
      branch,
      reason: `Workspace has local changes outside .sero/: ${meaningfulPaths.slice(0, 3).join(', ')}`,
    };
  }

  try {
    const headBefore = await resolveRef(workspacePath, 'HEAD', runner);
    const remoteRef = await refExists(workspacePath, `refs/remotes/origin/${branch}`, runner)
      ? `origin/${branch}`
      : null;
    const localBranchExists = await refExists(workspacePath, `refs/heads/${branch}`, runner);

    if (localBranchExists) {
      await runner.run(workspacePath, ['checkout', branch], 15_000);
    } else if (remoteRef) {
      await runner.run(workspacePath, ['checkout', '-B', branch, remoteRef], 15_000);
    } else {
      return {
        synced: false,
        branch,
        reason: `Default branch "${branch}" is not available locally or on origin.`,
      };
    }

    if (!remoteRef) {
      const headAfter = await resolveRef(workspacePath, 'HEAD', runner);
      return { synced: true, branch, headChanged: headBefore !== headAfter };
    }

    const localHead = await resolveRef(workspacePath, 'HEAD', runner);
    const remoteHead = await resolveRef(workspacePath, remoteRef, runner);
    if (localHead && remoteHead && localHead !== remoteHead) {
      await runner.run(workspacePath, ['merge', '--ff-only', remoteRef], 30_000);
    }

    const headAfter = await resolveRef(workspacePath, 'HEAD', runner);
    return { synced: true, branch, headChanged: headBefore !== headAfter };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { synced: false, branch, reason: message };
  }
}

export function extractStatusPath(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const pathPart = line.slice(3).trim();
  if (!pathPart) return null;
  if (pathPart.includes(' -> ')) {
    const [, dest] = pathPart.split(' -> ');
    return dest?.trim() || null;
  }
  return pathPart;
}

export function isIgnoredWorkspaceStatusPath(relPath: string): boolean {
  return relPath === '.sero-workspace.json' || relPath.startsWith('.sero/');
}

async function fetchOrigin(workspacePath: string, runner: GitRunner): Promise<void> {
  try {
    await runner.run(workspacePath, ['fetch', 'origin'], 30_000);
  } catch {
    // Best-effort — local-only repos are fine.
  }
}

async function detectDefaultBranch(workspacePath: string, runner: GitRunner): Promise<string | null> {
  try {
    const result = await runner.run(workspacePath, ['symbolic-ref', 'refs/remotes/origin/HEAD'], 10_000);
    const branch = result.stdout.trim().split('/').pop();
    if (branch) return branch;
  } catch {
    // Fall through to common names.
  }

  const branchChecks = await Promise.all(['main', 'master'].map(async (branch) => ({
    branch,
    hasRemote: await refExists(workspacePath, `refs/remotes/origin/${branch}`, runner),
    hasLocal: await refExists(workspacePath, `refs/heads/${branch}`, runner),
  })));
  const match = branchChecks.find(({ hasRemote, hasLocal }) => hasRemote || hasLocal);
  if (match) return match.branch;

  return null;
}

async function refExists(workspacePath: string, ref: string, runner: GitRunner): Promise<boolean> {
  try {
    await runner.run(workspacePath, ['rev-parse', '--verify', ref], 10_000);
    return true;
  } catch {
    return false;
  }
}

async function resolveRef(workspacePath: string, ref: string, runner: GitRunner): Promise<string | null> {
  try {
    const result = await runner.run(workspacePath, ['rev-parse', '--verify', ref], 10_000);
    return result.stdout.trim() || null;
  } catch {
    return null;
  }
}

async function getMeaningfulWorkspaceStatusPaths(workspacePath: string, runner: GitRunner): Promise<string[]> {
  try {
    const result = await runner.run(workspacePath, ['status', '--porcelain', '--untracked-files=all'], 15_000);
    return result.stdout
      .split('\n')
      .map(extractStatusPath)
      .filter((relPath): relPath is string => !!relPath)
      .filter((relPath) => !isIgnoredWorkspaceStatusPath(relPath));
  } catch {
    return [];
  }
}
