import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runGit } from '@electron/features/vcs/git-service/git-exec';
import { resolveStatePath } from '@electron/features/vcs/git-service/state-io';

export async function createGitRepo(prefix = 'sero-git-plugin-'): Promise<string> {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), prefix));
  runGit(['init'], repoPath);
  runGit(['config', 'user.name', 'Sero Test'], repoPath);
  runGit(['config', 'user.email', 'test@example.com'], repoPath);
  return repoPath;
}

export async function createBareRemote(prefix = 'sero-git-remote-'): Promise<string> {
  const remotePath = await mkdtemp(path.join(os.tmpdir(), prefix));
  runGit(['init', '--bare'], remotePath);
  return remotePath;
}

export async function writeRepoFile(repoPath: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = path.join(repoPath, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, 'utf8');
}

export function commitAll(repoPath: string, message: string): void {
  runGit(['add', '-A'], repoPath);
  runGit(['commit', '-m', message], repoPath);
}

export function statePathFor(repoPath: string): string {
  return resolveStatePath(repoPath);
}

export async function cleanupPaths(paths: string[]): Promise<void> {
  await Promise.all(paths.map((targetPath) => rm(targetPath, { recursive: true, force: true })));
}
