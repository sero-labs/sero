import { vcsManager, vcsOps } from '@electron/shared/infra/shared-infra';
import type { CliRegistry } from '@electron/cli/core/registry';
import { runSubcommand, type CliSubcommands } from '@electron/cli/core/subcommands';
import type { CliCommandContext } from '@electron/cli/core/types';
import { fail, ok, parseFlags } from '@electron/cli/lib/utils';

async function handleBranches(_rest: string[], ctx: CliCommandContext) {
  const branches = await vcsOps.listBranches(ctx.workspaceId);
  if (branches.length === 0) return ok('No branches.');
  return ok(
    branches
      .map((b) => `${b.name} -> ${b.sha}${b.isLocal ? ' (local)' : ''}`)
      .join('\n'),
  );
}

const GIT_SUBCOMMANDS: CliSubcommands = {
  status: async (_rest, ctx) => {
    const status = await vcsOps.getStatus(ctx.workspaceId);
    if (status.files.length === 0) {
      return ok('Working copy clean.');
    }
    const lines = status.files.map((f) => `${f.status.padEnd(8)} ${f.path}`);
    if (status.conflictCount > 0) lines.unshift(`Conflicts: ${status.conflictCount}`);
    return ok(lines.join('\n'));
  },
  log: async (rest, ctx) => {
    const { flags } = parseFlags(rest);
    const limitRaw = flags.get('limit');
    const limit = typeof limitRaw === 'string' ? Number(limitRaw) : 10;
    const entries = await vcsOps.getLogEntries(ctx.workspaceId, Number.isFinite(limit) ? limit : 10);
    if (entries.length === 0) return ok('No changes yet.');
    return ok(
      entries
        .map((e) => {
          const head = e.isWorkingCopy ? '*' : '-';
          const branches = e.branches.length ? ` [${e.branches.join(', ')}]` : '';
          return `${head} ${e.sha} ${e.description || '(no description)'}${branches}`;
        })
        .join('\n'),
    );
  },
  diff: async (rest, ctx) => {
    const from = rest[0];
    const to = rest[1];
    if (!from) return fail('Usage: sero git diff <from> [to]');
    const diff = await vcsManager.diff(ctx.workspaceId, from, to);
    return ok(diff.trim() || '(empty diff)');
  },
  checkpoint: async (rest, ctx) => {
    // Support: sero git checkpoint "msg", sero git checkpoint --message "msg"
    // Also handles bare `-m` by stripping it from positionals.
    const { flags, positionals } = parseFlags(rest);
    const flagMsg = flags.get('message');
    let message: string | undefined;
    if (typeof flagMsg === 'string') {
      message = flagMsg;
    } else {
      // Strip accidental `-m` from positionals (parseFlags only handles `--` prefixed)
      const cleaned = positionals.filter((p) => p !== '-m');
      message = cleaned.join(' ').trim() || undefined;
    }
    const cp = await vcsManager.createCheckpoint(ctx.workspaceId, {
      source: 'manual',
      description: message,
    });
    if (!cp) return fail('No file changes to checkpoint.');
    return ok(`Created checkpoint ${cp.sha}${cp.description ? ` — ${cp.description}` : ''}`);
  },
  push: async (rest, ctx) => {
    const branch = rest[0] || undefined;
    const result = await vcsOps.push(ctx.workspaceId, branch);
    return result.success ? ok(result.message) : fail(result.message);
  },
  fetch: async (rest, ctx) => {
    const remote = rest[0] || undefined;
    const result = await vcsOps.fetch(ctx.workspaceId, remote);
    return result.success ? ok(result.message) : fail(result.message);
  },
  remote: async (rest, ctx) => {
    const [subAction, ...subRest] = rest;
    if (!subAction || subAction === 'list') {
      const remotes = await vcsOps.listRemotes(ctx.workspaceId);
      if (remotes.length === 0) return ok('No remotes configured.');
      return ok(remotes.map((r) => `${r.name}\t${r.url}`).join('\n'));
    }
    if (subAction === 'add') {
      const [name, url] = subRest;
      if (!name || !url) return fail('Usage: sero git remote add <name> <url>');
      await vcsOps.addRemote(ctx.workspaceId, name, url);
      return ok(`Added remote '${name}' → ${url}`);
    }
    if (subAction === 'remove') {
      const name = subRest[0];
      if (!name) return fail('Usage: sero git remote remove <name>');
      await vcsOps.removeRemote(ctx.workspaceId, name);
      return ok(`Removed remote '${name}'`);
    }
    return fail('Usage: sero git remote [list|add <name> <url>|remove <name>]');
  },
  branches: handleBranches,
  // The jj name for branches; older sessions still call it.
  bookmarks: handleBranches,
};

async function handleGit(args: string[], ctx: CliCommandContext) {
  try {
    return await runSubcommand(GIT_SUBCOMMANDS, args, ctx, undefined, {
      unknown: (action) => action === undefined
        ? fail('Usage: sero git <status|log|diff|checkpoint|push|remote|fetch|branches>')
        : fail(`Unknown git action: ${action}`),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Git command failed';
    return fail(message);
  }
}

const GIT_CLI_HELP =
  'git — Version control\n\n' +
  'Usage: sero git <action> [args]\n\n' +
  'Actions:\n' +
  '  status                  Show working tree status\n' +
  '  log [--limit N]         Show recent commits\n' +
  '  diff <from> [to]        Show diff between revisions\n' +
  '  checkpoint [message]    Create checkpoint\n' +
  '  push [branch]           Push commits to the remote\n' +
  '  fetch [remote]          Fetch from remote(s)\n' +
  '  remote [list]           List configured remotes\n' +
  '  remote add <name> <url> Add a remote\n' +
  '  remote remove <name>    Remove a remote\n' +
  '  branches                List branches\n';

export function registerVcsCliCommands(registry: CliRegistry): void {
  registry.register({
    name: 'git',
    summary: 'Version control commands (status, log, diff, checkpoint, push, remote, fetch, branches)',
    help: GIT_CLI_HELP,
    source: 'ipc',
    group: 'Version Control',
    subcommands: GIT_SUBCOMMANDS,
    execute: handleGit,
  });

  // Legacy alias — agents and older sessions still call `sero vcs`.
  registry.register({
    name: 'vcs',
    summary: 'Alias of `sero git`',
    help: GIT_CLI_HELP,
    source: 'ipc',
    group: 'Version Control',
    subcommands: GIT_SUBCOMMANDS,
    execute: handleGit,
  });
}
