import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { guardWorkspaceWrite, runGit, type GitRunner } from '../git-guard';
import { memoryRegistry } from '../registry';

function git(args: string[], cwd: string): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

describe('workspace memory Git guard', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'sero-memory-git-'));
    memoryRegistry().gitChecks.clear();
  });

  afterEach(async () => {
    memoryRegistry().gitChecks.clear();
    await rm(root, { recursive: true, force: true });
  });

  it('adds the exclude rule when it is missing and allows the write', async () => {
    git(['init', '-q'], root);

    expect(await guardWorkspaceWrite(root)).toEqual({ ok: true });
    expect(await readFile(path.join(root, '.git', 'info', 'exclude'), 'utf8')).toContain('**/.sero/');
  });

  it('refuses writes when Git tracks a file in a memory subfolder', async () => {
    git(['init', '-q'], root);
    const tracked = path.join(root, '.sero', 'apps', 'memory', 'entries', 'pinned', 'mem-tracked1.md');
    await mkdir(path.dirname(tracked), { recursive: true });
    await writeFile(tracked, 'tracked');
    git(['add', '-f', tracked], root);

    const result = await guardWorkspaceWrite(root);
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason).toContain('Git tracks files');
  });

  it('allows writes in a workspace that is not a Git repository', async () => {
    expect(await guardWorkspaceWrite(root)).toEqual({ ok: true });
  });

  it('refuses the write when Git fails, and checks again on the next write', async () => {
    git(['init', '-q'], root);
    let calls = 0;
    const flaky: GitRunner = async (args, cwd) => {
      calls += 1;
      if (calls === 1) return { code: -1, stdout: '', stderr: 'spawn git ENOENT' };
      return runGit(args, cwd);
    };

    const first = await guardWorkspaceWrite(root, flaky);
    expect(first.ok).toBe(false);
    expect(memoryRegistry().gitChecks.has(root)).toBe(false);

    expect(await guardWorkspaceWrite(root, flaky)).toEqual({ ok: true });
  });

  it('without a git binary, allows a workspace with no .git folder and refuses one with it', async () => {
    const noGit: GitRunner = async () => ({ code: -1, stdout: '', stderr: 'spawn git ENOENT', missing: true });

    expect(await guardWorkspaceWrite(root, noGit)).toEqual({ ok: true });

    memoryRegistry().gitChecks.clear();
    await mkdir(path.join(root, '.git'));
    const refused = await guardWorkspaceWrite(root, noGit);
    expect(refused.ok).toBe(false);
    expect(memoryRegistry().gitChecks.has(root)).toBe(false);
  });

  it('does not run Git again after a definitive result', async () => {
    git(['init', '-q'], root);
    const counted = vi.fn(runGit);

    await guardWorkspaceWrite(root, counted);
    const callsAfterFirst = counted.mock.calls.length;
    await guardWorkspaceWrite(root, counted);
    await guardWorkspaceWrite(root, counted);

    expect(callsAfterFirst).toBeGreaterThan(0);
    expect(counted).toHaveBeenCalledTimes(callsAfterFirst);
  });
});
