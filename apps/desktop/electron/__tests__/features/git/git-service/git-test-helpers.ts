import { mkdtemp, rm, writeFile, mkdir, cp } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { execFileSync } from 'node:child_process';

import { resolveStatePath } from '@electron/features/git/git-service/state-io';

/** Sync git for test scaffolding only — product code uses runGitAsync. */
export function runGit(args: string[], cwd: string): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

/**
 * `git init` plus commits costs several process spawns per test, and every
 * test in these suites wants the same starting repository. Build each distinct
 * starting point once per worker and copy it — a plain directory copy, no
 * spawns. The copy is a real git repository, not a stand-in: the tests still
 * run real git against it.
 */
const templates = new Map<string, Promise<string>>();
const templateRoots: string[] = [];

function template(key: string, build: (dir: string) => Promise<void>): Promise<string> {
  const cached = templates.get(key);
  if (cached) return cached;

  const created = (async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sero-git-template-'));
    templateRoots.push(dir);
    await build(dir);
    return dir;
  })();
  templates.set(key, created);
  return created;
}

process.once('exit', () => {
  for (const dir of templateRoots) rmSync(dir, { recursive: true, force: true });
});

async function copyOfTemplate(templateDir: string, prefix: string): Promise<string> {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), prefix));
  await cp(templateDir, repoPath, { recursive: true });
  return repoPath;
}

async function initRepo(dir: string): Promise<void> {
  runGit(['init'], dir);
  runGit(['config', 'user.name', 'Sero Test'], dir);
  runGit(['config', 'user.email', 'test@example.com'], dir);
}

export async function createGitRepo(prefix = 'sero-git-plugin-'): Promise<string> {
  const templateDir = await template('empty', initRepo);
  return copyOfTemplate(templateDir, prefix);
}

/**
 * A copy of a directory built once per worker by `build`. `key` identifies the
 * starting point: two calls with the same key share one build and get
 * independent copies of it.
 */
export async function createRepoFromTemplate(
  key: string,
  build: (dir: string) => Promise<void>,
  prefix = 'sero-git-plugin-',
): Promise<string> {
  const templateDir = await template(key, build);
  return copyOfTemplate(templateDir, prefix);
}

/** A repo whose first commit already contains `files`. Equivalent to `createGitRepo` + `commitAll`. */
export async function createSeededRepo(
  files: Record<string, string>,
  options: { message?: string; prefix?: string } = {},
): Promise<string> {
  const message = options.message ?? 'initial';
  return createRepoFromTemplate(
    JSON.stringify({ files, message }),
    async (dir) => {
      await initRepo(dir);
      for (const [relativePath, content] of Object.entries(files)) {
        await writeRepoFile(dir, relativePath, content);
      }
      commitAll(dir, message);
    },
    options.prefix ?? 'sero-git-plugin-',
  );
}

export async function createBareRemote(prefix = 'sero-git-remote-'): Promise<string> {
  const templateDir = await template('bare', async (dir) => {
    runGit(['init', '--bare'], dir);
  });
  return copyOfTemplate(templateDir, prefix);
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
