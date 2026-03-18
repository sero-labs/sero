/**
 * Git Extension — Pi extension for Git workspace management.
 *
 * Reads/writes `.sero/apps/git/state.json` relative to the workspace cwd.
 * Provides a `git_manager` tool for the agent to query and mutate Git state.
 *
 * Tools (LLM-callable): git_manager
 * Commands (user): /git
 */

import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import { resolveStatePath, readState, writeState } from './state-io';
import {
  isGitRepo, getRepoName, getCurrentBranch, getHeadHash,
  getCommits, getBranches, getRemotes, getFileChanges,
  getStashes, getCommitCount, getFileDiff, getCommitDiff,
} from './git-commands';
import type { GitAppState } from '../shared/types';
import { DEFAULT_GIT_STATE } from '../shared/types';

// ── Refresh full state from git ───────────────────────────────

async function refreshState(cwd: string, statePath: string): Promise<GitAppState> {
  if (!isGitRepo(cwd)) {
    const state: GitAppState = {
      ...DEFAULT_GIT_STATE,
      repoPath: cwd,
      error: 'Not a git repository',
      lastRefresh: new Date().toISOString(),
    };
    await writeState(statePath, state);
    return state;
  }

  const state: GitAppState = {
    repoPath: cwd,
    repoName: getRepoName(cwd),
    currentBranch: getCurrentBranch(cwd),
    headHash: getHeadHash(cwd),
    branches: getBranches(cwd),
    remotes: getRemotes(cwd),
    commits: getCommits(cwd, 150),
    stashes: getStashes(cwd),
    fileChanges: getFileChanges(cwd),
    commitCount: getCommitCount(cwd),
    lastRefresh: new Date().toISOString(),
    loading: false,
  };

  await writeState(statePath, state);
  return state;
}

// ── Tool parameters ──────────────────────────────────────────

const ACTIONS = [
  'refresh', 'status', 'log', 'branches', 'diff',
  'stage', 'unstage', 'commit', 'checkout',
  'stash', 'stash_pop', 'fetch', 'pull', 'push',
  'create_branch', 'delete_branch', 'merge',
  'cherry_pick', 'show_commit',
] as const;

const GitManagerParams = Type.Object({
  action: StringEnum(ACTIONS),
  file: Type.Optional(Type.String({ description: 'File path for diff/stage/unstage' })),
  message: Type.Optional(Type.String({ description: 'Commit or stash message' })),
  branch: Type.Optional(Type.String({ description: 'Branch name' })),
  hash: Type.Optional(Type.String({ description: 'Commit hash' })),
  staged: Type.Optional(Type.Boolean({ description: 'View staged diff (default: false)' })),
  all: Type.Optional(Type.Boolean({ description: 'Stage all / push all' })),
});

// ── Extension ─────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let statePath = '';
  let cwd = '';

  pi.on('session_start', async (_event, ctx) => {
    cwd = ctx.cwd;
    statePath = resolveStatePath(cwd);
    await refreshState(cwd, statePath);
  });

  pi.on('session_switch', async (_event, ctx) => {
    cwd = ctx.cwd;
    statePath = resolveStatePath(cwd);
    await refreshState(cwd, statePath);
  });

  // ── Tool: git_manager ────────────────────────────────────

  pi.registerTool({
    name: 'git_manager',
    label: 'Git',
    description:
      'Manage the workspace Git repository. Actions: refresh (reload all state), status (working tree summary), log (recent commits), branches (list branches), diff (file diff — requires file, optional staged), stage (requires file or all=true), unstage (requires file or all=true), commit (requires message, optional all to auto-stage), checkout (requires branch), create_branch (requires branch), delete_branch (requires branch), merge (requires branch), cherry_pick (requires hash), stash (optional message), stash_pop, fetch, pull, push, show_commit (requires hash for detailed commit diff).',
    parameters: GitManagerParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const resolvedCwd = ctx?.cwd ?? cwd;
      const resolvedPath = ctx ? resolveStatePath(ctx.cwd) : statePath;
      if (!resolvedPath) {
        return { content: [{ type: 'text', text: 'Error: no workspace cwd set' }], details: {} };
      }
      cwd = resolvedCwd;
      statePath = resolvedPath;

      return handleAction(params, resolvedCwd, resolvedPath);
    },

    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('git '));
      text += theme.fg('muted', args.action);
      if (args.file) text += ` ${theme.fg('dim', args.file)}`;
      if (args.branch) text += ` ${theme.fg('accent', args.branch)}`;
      if (args.hash) text += ` ${theme.fg('accent', args.hash)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const text = result.content[0];
      const msg = text?.type === 'text' ? text.text : '';
      if (msg.startsWith('Error:')) return new Text(theme.fg('error', msg), 0, 0);
      return new Text(theme.fg('success', '✓ ') + theme.fg('muted', msg), 0, 0);
    },
  });

  // ── Command: /git ──────────────────────────────────────────

  pi.registerCommand('git', {
    description: 'Interact with the Git workspace manager',
    handler: async (args) => {
      const instruction = args.trim();
      if (instruction) {
        pi.sendUserMessage(`Using the git_manager tool: ${instruction}`);
      } else {
        pi.sendUserMessage('Using the git_manager tool: refresh the git status and show a summary.');
      }
    },
  });
}

// ── Action handlers ───────────────────────────────────────────

type ToolResult = { content: { type: string; text: string }[]; details: Record<string, unknown> };

async function handleAction(
  params: { action: string; file?: string; message?: string; branch?: string; hash?: string; staged?: boolean; all?: boolean },
  cwd: string,
  statePath: string,
): Promise<ToolResult> {
  const ok = (text: string): ToolResult => ({ content: [{ type: 'text', text }], details: {} });
  const err = (text: string): ToolResult => ({ content: [{ type: 'text', text: `Error: ${text}` }], details: {} });

  const { execSync } = await import('node:child_process');
  const exec = (cmd: string) =>
    execSync(cmd, { cwd, encoding: 'utf8', timeout: 30_000 }).trim();

  try {
    switch (params.action) {
      case 'refresh': {
        const state = await refreshState(cwd, statePath);
        const staged = state.fileChanges.filter((f) => f.staged).length;
        const unstaged = state.fileChanges.filter((f) => !f.staged).length;
        return ok(
          `Refreshed. Branch: ${state.currentBranch}, ` +
          `${state.branches.length} branches, ${state.commitCount} commits, ` +
          `${staged} staged, ${unstaged} unstaged files.`,
        );
      }

      case 'status': {
        const state = await refreshState(cwd, statePath);
        const staged = state.fileChanges.filter((f) => f.staged);
        const unstaged = state.fileChanges.filter((f) => !f.staged);
        let msg = `On branch ${state.currentBranch}\n`;
        if (staged.length) msg += `\nStaged (${staged.length}):\n${staged.map((f) => `  ${f.status[0].toUpperCase()} ${f.path}`).join('\n')}`;
        if (unstaged.length) msg += `\nUnstaged (${unstaged.length}):\n${unstaged.map((f) => `  ${f.status[0].toUpperCase()} ${f.path}`).join('\n')}`;
        if (!staged.length && !unstaged.length) msg += '\nWorking tree clean.';
        return ok(msg);
      }

      case 'log': {
        const state = await readState(statePath);
        const recent = state.commits.slice(0, 20);
        if (!recent.length) return ok('No commits found.');
        return ok(recent.map((c) => `${c.shortHash} ${c.subject} (${c.authorName})`).join('\n'));
      }

      case 'branches': {
        const state = await readState(statePath);
        return ok(state.branches.map((b) => `${b.current ? '* ' : '  '}${b.name}${b.remote ? ` -> ${b.remote}` : ''}${b.ahead ? ` +${b.ahead}` : ''}${b.behind ? ` -${b.behind}` : ''}`).join('\n') || 'No branches.');
      }

      case 'diff': {
        if (!params.file) return err('file is required for diff');
        const diff = getFileDiff(cwd, params.file, params.staged ?? false);
        if (!diff) return ok('No diff for this file.');
        const state = await readState(statePath);
        state.activeDiff = diff;
        await writeState(statePath, state);
        return ok(`Diff for ${params.file}: +${diff.additions} -${diff.deletions} (${diff.hunks.length} hunks)`);
      }

      case 'stage': {
        if (params.all) exec('git add -A');
        else if (params.file) exec(`git add -- "${params.file}"`);
        else return err('file or all=true required');
        await refreshState(cwd, statePath);
        return ok(params.all ? 'Staged all changes.' : `Staged ${params.file}`);
      }

      case 'unstage': {
        if (params.all) exec('git reset HEAD');
        else if (params.file) exec(`git reset HEAD -- "${params.file}"`);
        else return err('file or all=true required');
        await refreshState(cwd, statePath);
        return ok(params.all ? 'Unstaged all.' : `Unstaged ${params.file}`);
      }

      case 'commit': {
        if (!params.message) return err('message is required for commit');
        if (params.all) exec('git add -A');
        exec(`git commit -m "${params.message.replace(/"/g, '\\"')}"`);
        await refreshState(cwd, statePath);
        return ok(`Committed: ${params.message}`);
      }

      case 'checkout': {
        if (!params.branch) return err('branch is required');
        exec(`git checkout "${params.branch}"`);
        await refreshState(cwd, statePath);
        return ok(`Switched to ${params.branch}`);
      }

      case 'create_branch': {
        if (!params.branch) return err('branch name is required');
        exec(`git checkout -b "${params.branch}"`);
        await refreshState(cwd, statePath);
        return ok(`Created and switched to ${params.branch}`);
      }

      case 'delete_branch': {
        if (!params.branch) return err('branch name is required');
        exec(`git branch -d "${params.branch}"`);
        await refreshState(cwd, statePath);
        return ok(`Deleted branch ${params.branch}`);
      }

      case 'merge': {
        if (!params.branch) return err('branch is required');
        const result = exec(`git merge "${params.branch}"`);
        await refreshState(cwd, statePath);
        return ok(`Merged ${params.branch}: ${result.split('\n')[0]}`);
      }

      case 'cherry_pick': {
        if (!params.hash) return err('hash is required');
        exec(`git cherry-pick ${params.hash}`);
        await refreshState(cwd, statePath);
        return ok(`Cherry-picked ${params.hash}`);
      }

      case 'stash': {
        const msg = params.message ? `-m "${params.message.replace(/"/g, '\\"')}"` : '';
        exec(`git stash push ${msg}`);
        await refreshState(cwd, statePath);
        return ok('Changes stashed.');
      }

      case 'stash_pop': {
        exec('git stash pop');
        await refreshState(cwd, statePath);
        return ok('Stash popped.');
      }

      case 'fetch': {
        exec('git fetch --all --prune');
        await refreshState(cwd, statePath);
        return ok('Fetched all remotes.');
      }

      case 'pull': {
        const result = exec('git pull');
        await refreshState(cwd, statePath);
        return ok(`Pulled: ${result.split('\n')[0]}`);
      }

      case 'push': {
        const result = exec('git push');
        await refreshState(cwd, statePath);
        return ok(`Pushed: ${result || 'up to date'}`);
      }

      case 'show_commit': {
        if (!params.hash) return err('hash is required');
        const diffs = getCommitDiff(cwd, params.hash);
        const state = await readState(statePath);
        state.commitDiffs = diffs;
        state.selectedCommitHash = params.hash;
        await writeState(statePath, state);
        const totalAdd = diffs.reduce((s, d) => s + d.additions, 0);
        const totalDel = diffs.reduce((s, d) => s + d.deletions, 0);
        return ok(`Commit ${params.hash}: ${diffs.length} files, +${totalAdd} -${totalDel}`);
      }

      default:
        return err(`Unknown action: ${params.action}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(msg.split('\n')[0] ?? msg);
  }
}
