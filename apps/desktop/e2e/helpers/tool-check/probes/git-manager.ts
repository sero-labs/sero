/**
 * `git_manager`: every action runs in the check workspace, and each step's
 * effect is read back from the repository with plain `git`.
 *
 * The workspace is shared with other probes, so this one makes itself
 * self-contained: it sets other probes' leftovers aside in a stash, adds its
 * own remote (`tc-gm`) and branches (`tc-gm-*`), and the last step puts the
 * workspace back exactly as it found it (main at its old commit, no `tc-gm`
 * remote or branches, the leftovers restored).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ScenarioStep, StepContext, ToolCallResult, ToolProbe } from '../types';
import { expectText } from '../expect';
import { expectFile, fileText, putFile } from '../files';

const REMOTE = 'tc-gm';
const DOC = 'tc-gm-doc.txt';
const STATE_FILE = '.sero/apps/git/state.json';
/** Branches this probe creates, deleted again by the last step. */
const BRANCHES = ['tc-gm-feature', 'tc-gm-pick', 'tc-gm-made', 'tc-gm-sync', 'tc-gm-clash', 'tc-gm-wt'];
const REMOTE_BRANCHES = ['tc-gm-sync', 'tc-gm-fetched'];

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.email=probe@example.com', '-c', 'user.name=Probe', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Runs git and reports whether it succeeded. */
function gitOk(cwd: string, ...args: string[]): boolean {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}

/** Commits one new file on the current branch and returns the commit hash. */
function commitFile(cwd: string, file: string, content: string, subject: string): string {
  fs.writeFileSync(path.join(cwd, file), content);
  git(cwd, 'add', '--', file);
  git(cwd, 'commit', '-q', '-m', subject);
  return git(cwd, 'rev-parse', 'HEAD');
}

/** Pushes new work to the remote from a separate clone, as another person would. */
function pushFromElsewhere(ctx: StepContext, work: (clone: string) => void): void {
  const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-gm-clone-'));
  try {
    git(clone, 'clone', '-q', ctx.fixtures.gitRemotePath, '.');
    work(clone);
  } finally {
    fs.rmSync(clone, { recursive: true, force: true });
  }
}

const cwdOf = (ctx: StepContext) => ctx.workspacePath;
const lines = (text: string) => (text ? text.split('\n') : []);

/** A tool failure is reported as "Error: ..." text without the error flag. */
function expectMessage(result: ToolCallResult, fragment: string): void {
  expectText(result, fragment);
  if (result.text.startsWith('Error:')) throw new Error(`git_manager failed: ${result.text}`);
}

/** The parts of `.sero/apps/git/state.json` the steps read. */
interface GitStateFile {
  currentBranch?: string;
  branches?: unknown[];
  activeDiff?: { path?: string; additions?: number };
  selectedCommitHash?: string;
}

async function stateFile(ctx: StepContext): Promise<GitStateFile> {
  return JSON.parse((await fileText(ctx, STATE_FILE)) ?? '{}') as GitStateFile;
}

function stashMessages(ctx: StepContext): string[] {
  return lines(git(cwdOf(ctx), 'stash', 'list', '--format=%gs'));
}

/** Sets the workspace up: leftovers aside, the remote, a base commit and the branches the steps use. */
function begin(ctx: StepContext): void {
  const cwd = cwdOf(ctx);
  if (git(cwd, 'status', '--porcelain')) {
    git(cwd, 'stash', 'push', '-u', '-m', 'tc-gm-others');
    ctx.state.gmSetAside = true;
  }
  git(cwd, 'checkout', '-q', 'main');
  // Leftovers of an earlier run of this probe that stopped half way.
  for (const branch of BRANCHES) gitOk(cwd, 'branch', '-D', branch);
  gitOk(cwd, 'remote', 'remove', REMOTE);
  gitOk(cwd, 'worktree', 'prune');
  ctx.state.gmBase = git(cwd, 'rev-parse', 'HEAD');
  git(cwd, 'remote', 'add', REMOTE, ctx.fixtures.gitRemotePath);

  commitFile(cwd, DOC, 'one\ntwo\n', 'tc-gm base');
  // Branches that fork from main before main moves on, so a merge has two sides.
  git(cwd, 'checkout', '-q', '-b', 'tc-gm-feature');
  commitFile(cwd, 'tc-gm-feature.txt', 'feature\n', 'tc-gm feature commit');
  git(cwd, 'checkout', '-q', 'main');
  git(cwd, 'checkout', '-q', '-b', 'tc-gm-pick');
  ctx.state.gmPickHash = commitFile(cwd, 'tc-gm-pick.txt', 'pick\n', 'tc-gm pick commit');
  git(cwd, 'checkout', '-q', 'main');
}

/** Puts the workspace back as `begin` found it. Throws if anything is left behind. */
function finish(ctx: StepContext): void {
  const cwd = cwdOf(ctx);
  for (const dir of (ctx.state.gmTempDirs as string[] | undefined) ?? []) fs.rmSync(dir, { recursive: true, force: true });
  gitOk(cwd, 'merge', '--abort');
  git(cwd, 'checkout', '-q', 'main');
  git(cwd, 'reset', '-q', '--hard', String(ctx.state.gmBase));
  git(cwd, 'worktree', 'prune');
  for (const branch of BRANCHES) gitOk(cwd, 'branch', '-D', branch);
  gitOk(cwd, 'push', REMOTE, '--delete', ...REMOTE_BRANCHES);
  git(cwd, 'remote', 'remove', REMOTE);
  if (ctx.state.gmSetAside) {
    const index = stashMessages(ctx).findIndex((message) => message.includes('tc-gm-others'));
    if (index === -1) throw new Error('the stash holding the other probes\' files is gone');
    git(cwd, 'stash', 'pop', '-q', `stash@{${index}}`);
  }
  const left = lines(git(cwd, 'branch', '--list', 'tc-gm-*', '--format=%(refname:short)'));
  if (left.length || lines(git(cwd, 'remote')).includes(REMOTE) || git(cwd, 'branch', '--show-current') !== 'main') {
    throw new Error(`the workspace was not put back: branches [${left.join(', ')}], remotes [${git(cwd, 'remote')}]`);
  }
}

const steps: ScenarioStep[] = [
  {
    action: 'refresh',
    setup: async (ctx) => begin(ctx),
    params: { action: 'refresh' },
    async expect(result, ctx) {
      expectMessage(result, 'Refreshed. Branch: main, ');
      const branches = lines(git(cwdOf(ctx), 'for-each-ref', '--format=%(refname)', 'refs/heads/')).length;
      if (!result.text.includes(`, ${branches} branches, `)) throw new Error(`expected ${branches} branches: ${result.text}`);
      if (!result.text.endsWith('0 staged, 0 unstaged files.')) throw new Error(`the tree should be clean: ${result.text}`);
      const state = await stateFile(ctx);
      if (state.currentBranch !== 'main' || state.branches?.length !== branches) {
        throw new Error(`the state file holds ${String(state.currentBranch)} with ${String(state.branches?.length)} branches`);
      }
    },
  },
  {
    action: 'status',
    setup: (ctx) => putFile(ctx, DOC, 'one\ntwo\nthree\n'),
    params: { action: 'status' },
    expect(result, ctx) {
      expectMessage(result, 'On branch main');
      if (!/Unstaged \(1\):\s+M tc-gm-doc\.txt/.test(result.text)) throw new Error(`the edit is not listed: ${result.text}`);
      if (git(cwdOf(ctx), 'status', '--porcelain', '--', DOC) !== `M ${DOC}`) throw new Error('git disagrees about the working tree');
    },
  },
  {
    action: 'diff',
    params: { action: 'diff', file: DOC },
    async expect(result, ctx) {
      expectMessage(result, `Diff for ${DOC}: +1 -0 (1 hunks)`);
      const diff = (await stateFile(ctx)).activeDiff;
      if (diff?.path !== DOC || diff.additions !== 1) throw new Error(`the state file's diff is ${JSON.stringify(diff)}`);
    },
  },
  {
    action: 'stage',
    params: { action: 'stage', file: DOC },
    expect(result, ctx) {
      expectMessage(result, `Staged ${DOC}`);
      if (git(cwdOf(ctx), 'diff', '--cached', '--name-only') !== DOC) throw new Error('the file is not in the index');
    },
  },
  {
    action: 'unstage',
    params: { action: 'unstage', file: DOC },
    expect(result, ctx) {
      expectMessage(result, `Unstaged ${DOC}`);
      if (git(cwdOf(ctx), 'diff', '--cached', '--name-only') !== '') throw new Error('the index still holds a change');
      if (git(cwdOf(ctx), 'diff', '--name-only') !== DOC) throw new Error('the edit was lost');
    },
  },
  {
    action: 'stage',
    params: { action: 'stage', all: true },
    expect(result, ctx) {
      expectMessage(result, 'Staged all changes.');
      if (git(cwdOf(ctx), 'diff', '--cached', '--name-only') !== DOC) throw new Error('the file is not in the index');
    },
  },
  {
    action: 'commit',
    params: { action: 'commit', message: 'tc-gm checkpoint' },
    expect(result, ctx) {
      expectMessage(result, 'Committed: tc-gm checkpoint');
      if (git(cwdOf(ctx), 'log', '-1', '--format=%s') !== 'tc-gm checkpoint') throw new Error('HEAD is not the new commit');
      if (git(cwdOf(ctx), 'status', '--porcelain') !== '') throw new Error('the tree is not clean after the commit');
      ctx.state.gmCommit = git(cwdOf(ctx), 'rev-parse', 'HEAD');
    },
  },
  {
    action: 'log',
    params: { action: 'log' },
    expect(result, ctx) {
      expectMessage(result, `${git(cwdOf(ctx), 'rev-parse', '--short', 'HEAD')} tc-gm checkpoint (`);
    },
  },
  {
    action: 'branches',
    params: { action: 'branches' },
    expect(result) {
      expectMessage(result, '* main');
      for (const branch of ['tc-gm-feature', 'tc-gm-pick']) {
        if (!result.text.includes(`  ${branch}`)) throw new Error(`${branch} is not listed: ${result.text}`);
      }
    },
  },
  {
    action: 'show_commit',
    params: (ctx) => ({ action: 'show_commit', hash: String(ctx.state.gmCommit) }),
    async expect(result, ctx) {
      expectMessage(result, `Commit ${String(ctx.state.gmCommit)}: 1 files, +1 -0`);
      if ((await stateFile(ctx)).selectedCommitHash !== ctx.state.gmCommit) throw new Error('the state file does not hold the commit');
    },
  },
  {
    action: 'create_branch',
    params: { action: 'create_branch', branch: 'tc-gm-made' },
    expect(result, ctx) {
      expectMessage(result, 'Created and switched to tc-gm-made');
      if (git(cwdOf(ctx), 'branch', '--show-current') !== 'tc-gm-made') throw new Error('the branch is not checked out');
    },
  },
  {
    action: 'checkout',
    params: { action: 'checkout', branch: 'main' },
    expect(result, ctx) {
      expectMessage(result, 'Switched to main');
      if (git(cwdOf(ctx), 'branch', '--show-current') !== 'main') throw new Error('main is not checked out');
    },
  },
  {
    action: 'delete_branch',
    params: { action: 'delete_branch', branch: 'tc-gm-made' },
    expect(result, ctx) {
      expectMessage(result, 'Deleted branch tc-gm-made');
      if (git(cwdOf(ctx), 'branch', '--list', 'tc-gm-made') !== '') throw new Error('the branch still exists');
    },
  },
  {
    action: 'stash',
    setup: (ctx) => putFile(ctx, DOC, 'one\ntwo\nthree\nfour\n'),
    params: { action: 'stash', message: 'tc-gm stash' },
    expect(result, ctx) {
      expectMessage(result, 'Changes stashed.');
      if (!stashMessages(ctx)[0]?.includes('tc-gm stash')) throw new Error(`the stash is not on top: ${stashMessages(ctx).join(' | ')}`);
      if (git(cwdOf(ctx), 'status', '--porcelain') !== '') throw new Error('the edit is still in the working tree');
    },
  },
  {
    action: 'stash_apply',
    params: { action: 'stash_apply', stashIndex: 0 },
    async expect(result, ctx) {
      expectMessage(result, 'Applied stash@{0}.');
      if (!(await fileText(ctx, DOC))?.includes('four')) throw new Error('the stashed edit did not come back');
      if (!stashMessages(ctx)[0]?.includes('tc-gm stash')) throw new Error('apply dropped the stash');
    },
  },
  {
    action: 'stash_pop',
    // Put the file back so the pop applies onto a clean tree.
    setup: async (ctx) => { git(cwdOf(ctx), 'checkout', '--', DOC); },
    params: { action: 'stash_pop', stashIndex: 0 },
    async expect(result, ctx) {
      expectMessage(result, 'Popped stash@{0}.');
      if (!(await fileText(ctx, DOC))?.includes('four')) throw new Error('the stashed edit did not come back');
      if (stashMessages(ctx).some((message) => message.includes('tc-gm stash'))) throw new Error('pop left the stash behind');
    },
  },
  {
    action: 'merge',
    setup: async (ctx) => { git(cwdOf(ctx), 'checkout', '--', DOC); },
    params: { action: 'merge', branch: 'tc-gm-feature' },
    expect(result, ctx) {
      expectMessage(result, 'Merged tc-gm-feature: ');
      const cwd = cwdOf(ctx);
      if (git(cwd, 'rev-list', '--parents', '-n', '1', 'HEAD').split(' ').length !== 3) throw new Error('HEAD is not a merge commit');
      git(cwd, 'merge-base', '--is-ancestor', 'tc-gm-feature', 'HEAD');
      if (!fs.existsSync(path.join(cwd, 'tc-gm-feature.txt'))) throw new Error('the merged file is missing');
    },
  },
  {
    action: 'cherry_pick',
    params: (ctx) => ({ action: 'cherry_pick', hash: String(ctx.state.gmPickHash) }),
    expect(result, ctx) {
      expectMessage(result, `Cherry-picked ${String(ctx.state.gmPickHash)}`);
      const cwd = cwdOf(ctx);
      if (git(cwd, 'log', '-1', '--format=%s') !== 'tc-gm pick commit') throw new Error('HEAD is not the picked commit');
      if (!fs.existsSync(path.join(cwd, 'tc-gm-pick.txt'))) throw new Error('the picked file is missing');
    },
  },
  {
    action: 'push',
    setup: async (ctx) => {
      // A branch that tracks the same-named branch on the remote, so a plain push has a target.
      const cwd = cwdOf(ctx);
      git(cwd, 'checkout', '-q', '-b', 'tc-gm-sync');
      commitFile(cwd, 'tc-gm-sync.txt', 'sync\n', 'tc-gm sync commit');
      git(cwd, 'config', 'branch.tc-gm-sync.remote', REMOTE);
      git(cwd, 'config', 'branch.tc-gm-sync.merge', 'refs/heads/tc-gm-sync');
    },
    params: { action: 'push' },
    expect(result, ctx) {
      expectMessage(result, 'Pushed: ');
      const pushed = git(ctx.fixtures.gitRemotePath, 'rev-parse', 'refs/heads/tc-gm-sync');
      if (pushed !== git(cwdOf(ctx), 'rev-parse', 'HEAD')) throw new Error(`the remote's tc-gm-sync is ${pushed}`);
    },
  },
  {
    action: 'fetch',
    setup: async (ctx) => pushFromElsewhere(ctx, (clone) => {
      git(clone, 'checkout', '-q', '-b', 'tc-gm-fetched');
      git(clone, 'commit', '-q', '--allow-empty', '-m', 'tc-gm fetched from elsewhere');
      git(clone, 'push', '-q', 'origin', 'tc-gm-fetched');
    }),
    params: { action: 'fetch' },
    expect(result, ctx) {
      expectMessage(result, 'Fetched all remotes.');
      git(cwdOf(ctx), 'rev-parse', '--verify', `refs/remotes/${REMOTE}/tc-gm-fetched`);
    },
  },
  {
    action: 'pull',
    setup: async (ctx) => pushFromElsewhere(ctx, (clone) => {
      git(clone, 'checkout', '-q', 'tc-gm-sync');
      commitFile(clone, 'tc-gm-pulled.txt', 'pulled\n', 'tc-gm pulled from elsewhere');
      git(clone, 'push', '-q', 'origin', 'tc-gm-sync');
    }),
    params: { action: 'pull' },
    expect(result, ctx) {
      expectMessage(result, 'Pulled: ');
      const cwd = cwdOf(ctx);
      if (!fs.existsSync(path.join(cwd, 'tc-gm-pulled.txt'))) throw new Error('the pulled file is missing');
      if (git(cwd, 'rev-parse', 'HEAD') !== git(ctx.fixtures.gitRemotePath, 'rev-parse', 'refs/heads/tc-gm-sync')) throw new Error('HEAD is not the remote tip');
    },
  },
  {
    action: 'abort_merge',
    setup: async (ctx) => {
      // An add/add conflict: both sides create the same file with different content.
      const cwd = cwdOf(ctx);
      git(cwd, 'checkout', '-q', 'main');
      git(cwd, 'checkout', '-q', '-b', 'tc-gm-clash');
      commitFile(cwd, 'tc-gm-clash.txt', 'clash side\n', 'tc-gm clash side');
      git(cwd, 'checkout', '-q', 'main');
      commitFile(cwd, 'tc-gm-clash.txt', 'main side\n', 'tc-gm main side');
      if (gitOk(cwd, 'merge', 'tc-gm-clash')) throw new Error('the merge should have stopped on a conflict');
      git(cwd, 'rev-parse', '--verify', 'MERGE_HEAD');
    },
    params: { action: 'abort_merge' },
    async expect(result, ctx) {
      expectMessage(result, 'Merge aborted.');
      const cwd = cwdOf(ctx);
      if (gitOk(cwd, 'rev-parse', '-q', '--verify', 'MERGE_HEAD')) throw new Error('the merge is still in progress');
      if (git(cwd, 'status', '--porcelain') !== '') throw new Error('the abort left changes in the tree');
      await expectFile(ctx, 'tc-gm-clash.txt', 'main side\n');
    },
  },
  {
    action: 'remove_worktree',
    setup: async (ctx) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-gm-wt-'));
      ctx.state.gmTempDirs = [dir];
      ctx.state.gmWorktree = path.join(dir, 'tree');
      git(cwdOf(ctx), 'worktree', 'add', '-q', '-b', 'tc-gm-wt', String(ctx.state.gmWorktree));
    },
    params: (ctx) => ({ action: 'remove_worktree', worktreePath: String(ctx.state.gmWorktree) }),
    expect(result, ctx) {
      expectMessage(result, `Removed worktree ${String(ctx.state.gmWorktree)}`);
      if (fs.existsSync(String(ctx.state.gmWorktree))) throw new Error('the worktree folder is still there');
      if (git(cwdOf(ctx), 'worktree', 'list', '--porcelain').includes('tc-gm-wt-')) throw new Error('git still lists the worktree');
      // The last step: leave the workspace as it was found.
      finish(ctx);
    },
  },
];

export const gitManagerProbe: ToolProbe = { tool: 'git_manager', steps };
