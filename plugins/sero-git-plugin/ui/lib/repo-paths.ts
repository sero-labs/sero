/**
 * Git paths are relative to the repository root. The host's file bridge
 * resolves paths against the *workspace* root and refuses to read outside it.
 * Those two roots are the same in the normal case and not always.
 */

function normalise(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * A repo-relative git path rewritten relative to the workspace root, or null
 * when the file sits outside the workspace and cannot be read from disk.
 */
export function toWorkspacePath(
  workspacePath: string,
  repoPath: string,
  gitPath: string,
): string | null {
  const workspace = normalise(workspacePath);
  const repo = normalise(repoPath);
  if (!workspace || !repo) return gitPath;
  if (workspace === repo) return gitPath;

  // Repo nested inside the workspace: prefix the git path with the offset.
  if (repo.startsWith(`${workspace}/`)) {
    return `${repo.slice(workspace.length + 1)}/${gitPath}`;
  }

  // Workspace nested inside the repo: the file is only reachable when it
  // happens to live under the workspace directory.
  if (workspace.startsWith(`${repo}/`)) {
    const offset = `${workspace.slice(repo.length + 1)}/`;
    return gitPath.startsWith(offset) ? gitPath.slice(offset.length) : null;
  }

  return null;
}
