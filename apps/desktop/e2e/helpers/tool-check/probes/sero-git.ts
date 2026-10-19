import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { StepContext, ToolProbe } from '../types';
import { expectText } from '../expect';
import { putFile } from '../files';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.email=probe@example.com', '-c', 'user.name=Probe', ...args], { cwd, encoding: 'utf8' }).trim();
}

/** Pushes a new branch to the remote from a separate clone, so a fetch has something to bring in. */
function pushFromElsewhere(ctx: StepContext, branch: string): void {
  const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-tool-check-clone-'));
  try {
    git(clone, 'clone', '-q', ctx.fixtures.gitRemoteHostPath, '.');
    git(clone, 'checkout', '-q', '-b', branch);
    git(clone, 'commit', '-q', '--allow-empty', '-m', `${branch} from elsewhere`);
    git(clone, 'push', '-q', 'origin', branch);
  } finally {
    fs.rmSync(clone, { recursive: true, force: true });
  }
}

/** `sero git` and its `sero vcs` alias run the same steps. Each run adds `origin` and removes it at the end. */
function gitProbe(tool: 'sero git' | 'sero vcs'): ToolProbe {
  const name = tool.split(' ')[1]!;
  // At the root: git status lists an untracked folder, not the files in it.
  const file = `tool-check-${name}.txt`;
  const message = `tool check ${name} checkpoint`;
  const fetched = `tc-fetched-${name}`;
  return {
    tool,
    steps: [
      {
        action: 'status',
        // The site pass runs this again after a checkpoint, so each run changes the file anew.
        setup: (ctx) => putFile(ctx, file, `changed by the ${name} probe at ${ctx.site}, ${Date.now()}\n`),
        params: { argv: ['status'] },
        expect: (result) => expectText(result, file),
      },
      {
        action: 'checkpoint',
        params: { argv: ['checkpoint', message] },
        expect(result, ctx) {
          expectText(result, 'Created checkpoint');
          const subject = git(ctx.workspacePath, 'log', '-1', '--format=%s');
          if (!subject.includes(message)) throw new Error(`HEAD is "${subject}", not the checkpoint`);
          ctx.state.head = git(ctx.workspacePath, 'rev-parse', 'HEAD');
        },
      },
      { action: 'log', params: { argv: ['log', '--limit', '3'] }, expect: (result) => expectText(result, message) },
      { action: 'diff', params: { argv: ['diff', 'HEAD~1', 'HEAD'] }, expect: (result) => expectText(result, file) },
      {
        action: 'remote',
        params: (ctx) => ({ argv: ['remote', 'add', 'origin', ctx.fixtures.gitRemotePath] }),
        expect(result, ctx) {
          expectText(result, "Added remote 'origin'");
          if (git(ctx.workspacePath, 'remote', 'get-url', 'origin') !== ctx.fixtures.gitRemotePath) throw new Error('origin points elsewhere');
        },
      },
      { action: 'remote', params: { argv: ['remote', 'list'] }, expect: (result, ctx) => expectText(result, `origin\t${ctx.fixtures.gitRemotePath}`) },
      {
        action: 'push',
        params: { argv: ['push', 'main'] },
        expect(result, ctx) {
          expectText(result, "Pushed branch 'main'");
          const pushed = git(ctx.fixtures.gitRemoteHostPath, 'rev-parse', 'main');
          if (pushed !== ctx.state.head) throw new Error(`the remote's main is ${pushed}, not ${String(ctx.state.head)}`);
        },
      },
      {
        action: 'fetch',
        setup: async (ctx) => pushFromElsewhere(ctx, fetched),
        params: { argv: ['fetch', 'origin'] },
        expect(_result, ctx) {
          git(ctx.workspacePath, 'rev-parse', '--verify', `refs/remotes/origin/${fetched}`);
        },
      },
      { action: 'branches', params: { argv: ['branches'] }, expect: (result) => expectText(result, 'main -> ') },
      { action: 'bookmarks', params: { argv: ['bookmarks'] }, expect: (result) => expectText(result, 'main -> ') },
      {
        action: 'remote',
        params: { argv: ['remote', 'remove', 'origin'] },
        expect(result, ctx) {
          expectText(result, "Removed remote 'origin'");
          if (git(ctx.workspacePath, 'remote').split('\n').includes('origin')) throw new Error('origin is still configured');
        },
      },
    ],
  };
}

export const seroGitProbe = gitProbe('sero git');
export const seroVcsProbe = gitProbe('sero vcs');
