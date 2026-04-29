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

import type { GitManagerRequest } from '../shared/types';
import { refreshGitState, runGitAction } from './git-service';
import { resolveStatePath } from './state-io';

const ACTIONS = [
  'refresh',
  'status',
  'log',
  'branches',
  'diff',
  'stage',
  'unstage',
  'commit',
  'checkout',
  'stash',
  'stash_pop',
  'stash_apply',
  'fetch',
  'pull',
  'push',
  'create_branch',
  'delete_branch',
  'remove_worktree',
  'merge',
  'cherry_pick',
  'show_commit',
] as const;

const GitManagerParams = Type.Object({
  action: StringEnum(ACTIONS),
  file: Type.Optional(Type.String({ description: 'File path for diff/stage/unstage' })),
  message: Type.Optional(Type.String({ description: 'Commit or stash message' })),
  branch: Type.Optional(Type.String({ description: 'Branch name' })),
  hash: Type.Optional(Type.String({ description: 'Commit hash' })),
  worktreePath: Type.Optional(Type.String({ description: 'Linked worktree path' })),
  staged: Type.Optional(Type.Boolean({ description: 'View staged diff (default: false)' })),
  all: Type.Optional(Type.Boolean({ description: 'Stage all / push all' })),
  force: Type.Optional(Type.Boolean({ description: 'Force the action when supported (for example, branch deletion)' })),
  stashIndex: Type.Optional(Type.Number({ description: 'Specific stash index to apply/pop (e.g. 0 for stash@{0})' })),
});

type ToolResult = {
  content: { type: 'text'; text: string }[];
  details: Record<string, unknown>;
};

export default function (pi: ExtensionAPI) {
  let statePath = '';
  let cwd = '';

  const syncWorkspaceState = async (nextCwd: string) => {
    cwd = nextCwd;
    statePath = resolveStatePath(nextCwd);
    await refreshGitState(nextCwd, statePath);
  };

  pi.on('session_start', async (_event, ctx) => {
    await syncWorkspaceState(ctx.cwd);
  });

  pi.on('session_switch', async (_event, ctx) => {
    await syncWorkspaceState(ctx.cwd);
  });

  pi.registerTool({
    name: 'git_manager',
    label: 'Git',
    description:
      'Manage the workspace Git repository. Actions: refresh (reload all state), status (working tree summary), log (recent commits), branches (list branches), diff (file diff — requires file, optional staged), stage (requires file or all=true), unstage (requires file or all=true), commit (requires message, optional all to auto-stage), checkout (requires branch), create_branch (requires branch), delete_branch (requires branch, optional force=true for -D), remove_worktree (requires worktreePath, optional force=true), merge (requires branch), cherry_pick (requires hash, optional all=true to auto-stash a dirty working tree first), stash (optional message), stash_pop (optional stashIndex to pop a specific stash), stash_apply (optional stashIndex to apply without dropping the stash), fetch, pull, push, show_commit (requires hash for detailed commit diff).',
    parameters: GitManagerParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const resolvedCwd = ctx?.cwd ?? cwd;
      const resolvedPath = ctx ? resolveStatePath(ctx.cwd) : statePath;
      if (!resolvedPath) {
        return toToolResult({ ok: false, message: 'no workspace cwd set' });
      }

      cwd = resolvedCwd;
      statePath = resolvedPath;

      return toToolResult(await runGitAction(params as GitManagerRequest, resolvedCwd, resolvedPath));
    },

    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('git '));
      text += theme.fg('muted', args.action);
      if (args.file) text += ` ${theme.fg('dim', args.file)}`;
      if (args.branch) text += ` ${theme.fg('accent', args.branch)}`;
      if (args.hash) text += ` ${theme.fg('accent', args.hash)}`;
      if (args.worktreePath) text += ` ${theme.fg('dim', args.worktreePath)}`;
      if (args.force) text += ` ${theme.fg('error', '--force')}`;
      if (typeof args.stashIndex === 'number') text += ` ${theme.fg('accent', `stash@{${args.stashIndex}}`)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const content = result.content[0];
      const message = content?.type === 'text' ? content.text : '';
      if (message.startsWith('Error:')) return new Text(theme.fg('error', message), 0, 0);
      return new Text(theme.fg('success', '✓ ') + theme.fg('muted', message), 0, 0);
    },
  });

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

function toToolResult(result: { ok: boolean; message: string }): ToolResult {
  return {
    content: [{ type: 'text', text: result.ok ? result.message : `Error: ${result.message}` }],
    details: {},
  };
}
