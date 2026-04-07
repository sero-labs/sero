import { execFileSync } from 'node:child_process';

function git(args: string[], cwd: string): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function refExists(cwd: string, ref: string): boolean {
  return git(['rev-parse', '--verify', ref], cwd).length > 0;
}

export function getDefaultBranch(cwd: string): string | undefined {
  const remoteNames = ['origin', ...git(['remote'], cwd).split('\n').map((line) => line.trim()).filter(Boolean)];

  for (const remoteName of new Set(remoteNames)) {
    const symbolicRef = git(['symbolic-ref', `refs/remotes/${remoteName}/HEAD`], cwd).trim();
    const detectedBranch = symbolicRef.split('/').pop();
    if (detectedBranch) return detectedBranch;

    const remoteInfo = git(['remote', 'show', '-n', remoteName], cwd);
    const remoteHeadBranch = remoteInfo.match(/HEAD branch:\s+(.+)/)?.[1]?.trim();
    if (remoteHeadBranch && remoteHeadBranch !== '(unknown)') return remoteHeadBranch;
  }

  for (const branch of ['main', 'master']) {
    if (refExists(cwd, `refs/remotes/origin/${branch}`) || refExists(cwd, `refs/heads/${branch}`)) {
      return branch;
    }
  }

  return undefined;
}
