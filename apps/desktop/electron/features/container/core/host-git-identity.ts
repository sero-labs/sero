import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Re-read after five minutes so a changed identity is picked up during a session. */
const GIT_IDENTITY_TTL_MS = 5 * 60 * 1000;

export interface HostGitIdentity {
  name: string;
  email: string;
}

let cached: HostGitIdentity | null = null;
let cachedAt = 0;

/**
 * The name and email that git on the host would commit with, for copying into
 * a workspace container. Git takes them from `GIT_AUTHOR_*` and
 * `GIT_COMMITTER_*` before its config, so this does too. Those variables are
 * on Sero's own process and never reach a container on their own.
 */
export async function readHostGitIdentity(): Promise<HostGitIdentity> {
  if (cached && Date.now() - cachedAt < GIT_IDENTITY_TTL_MS) return cached;
  const env = process.env;
  cached = {
    name: env.GIT_AUTHOR_NAME || env.GIT_COMMITTER_NAME || await readGlobalGitConfig('user.name'),
    email: env.GIT_AUTHOR_EMAIL || env.GIT_COMMITTER_EMAIL || await readGlobalGitConfig('user.email'),
  };
  cachedAt = Date.now();
  return cached;
}

async function readGlobalGitConfig(key: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['config', '--global', key], { timeout: 5_000 });
    return stdout.trim();
  } catch {
    return '';
  }
}
