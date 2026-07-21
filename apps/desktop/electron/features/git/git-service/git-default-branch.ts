import { runGitAsync } from './git-exec';

function git(args: string[], cwd: string): Promise<string> {
  return runGitAsync(args, cwd, { allowFailure: true });
}

async function refExists(cwd: string, ref: string): Promise<boolean> {
  return (await git(['rev-parse', '--verify', ref], cwd)).length > 0;
}

export async function getDefaultBranch(cwd: string): Promise<string | undefined> {
  const remoteNames = ['origin', ...(await git(['remote'], cwd)).split('\n').map((line) => line.trim()).filter(Boolean)];

  for (const remoteName of new Set(remoteNames)) {
    const symbolicRef = (await git(['symbolic-ref', `refs/remotes/${remoteName}/HEAD`], cwd)).trim();
    const detectedBranch = symbolicRef.split('/').pop();
    if (detectedBranch) return detectedBranch;

    const remoteInfo = await git(['remote', 'show', '-n', remoteName], cwd);
    const remoteHeadBranch = remoteInfo.match(/HEAD branch:\s+(.+)/)?.[1]?.trim();
    if (remoteHeadBranch && remoteHeadBranch !== '(unknown)') return remoteHeadBranch;
  }

  for (const branch of ['main', 'master']) {
    if ((await refExists(cwd, `refs/remotes/origin/${branch}`)) || (await refExists(cwd, `refs/heads/${branch}`))) {
      return branch;
    }
  }

  return undefined;
}
