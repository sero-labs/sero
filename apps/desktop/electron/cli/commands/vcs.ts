import { vcsManager, vcsOps } from '../../ipc/shared-infra';
import type { CliRegistry } from '../registry';
import type { CliCommandContext } from '../types';
import { fail, ok, parseFlags } from './utils';

async function handleVcs(args: string[], ctx: CliCommandContext) {
  const [action, ...rest] = args;
  if (!action) return fail('Usage: sero vcs <status|log|diff|checkpoint|push|remote|fetch|bookmarks>');

  try {
    switch (action) {
      case 'status': {
        const status = await vcsOps.getStatus(ctx.workspaceId);
        if (status.files.length === 0) {
          return ok('Working copy clean.');
        }
        const lines = status.files.map((f) => `${f.status.padEnd(8)} ${f.path}`);
        if (status.conflictCount > 0) lines.unshift(`Conflicts: ${status.conflictCount}`);
        return ok(lines.join('\n'));
      }

      case 'log': {
        const { flags } = parseFlags(rest);
        const limitRaw = flags.get('limit');
        const limit = typeof limitRaw === 'string' ? Number(limitRaw) : 10;
        const entries = await vcsOps.getLogEntries(ctx.workspaceId, Number.isFinite(limit) ? limit : 10);
        if (entries.length === 0) return ok('No changes yet.');
        return ok(
          entries
            .map((e) => {
              const head = e.isWorkingCopy ? '*' : '-';
              const bookmarks = e.bookmarks.length ? ` [${e.bookmarks.join(', ')}]` : '';
              return `${head} ${e.changeId} ${e.description || '(no description)'}${bookmarks}`;
            })
            .join('\n'),
        );
      }

      case 'diff': {
        const from = rest[0];
        const to = rest[1];
        if (!from) return fail('Usage: sero vcs diff <from> [to]');
        const diff = await vcsManager.diff(ctx.workspaceId, from, to);
        return ok(diff.trim() || '(empty diff)');
      }

      case 'checkpoint': {
        // Support: sero vcs checkpoint "msg", sero vcs checkpoint --message "msg"
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
        return ok(`Created checkpoint ${cp.changeId}${cp.description ? ` — ${cp.description}` : ''}`);
      }

      case 'push': {
        const branch = rest[0] || undefined;
        const result = await vcsOps.push(ctx.workspaceId, branch);
        return result.success ? ok(result.message) : fail(result.message);
      }

      case 'fetch': {
        const remote = rest[0] || undefined;
        const result = await vcsOps.fetch(ctx.workspaceId, remote);
        return result.success ? ok(result.message) : fail(result.message);
      }

      case 'remote': {
        const [subAction, ...subRest] = rest;
        if (!subAction || subAction === 'list') {
          const remotes = await vcsOps.listRemotes(ctx.workspaceId);
          if (remotes.length === 0) return ok('No remotes configured.');
          return ok(remotes.map((r) => `${r.name}\t${r.url}`).join('\n'));
        }
        if (subAction === 'add') {
          const [name, url] = subRest;
          if (!name || !url) return fail('Usage: sero vcs remote add <name> <url>');
          await vcsOps.addRemote(ctx.workspaceId, name, url);
          return ok(`Added remote '${name}' → ${url}`);
        }
        if (subAction === 'remove') {
          const name = subRest[0];
          if (!name) return fail('Usage: sero vcs remote remove <name>');
          await vcsOps.removeRemote(ctx.workspaceId, name);
          return ok(`Removed remote '${name}'`);
        }
        return fail('Usage: sero vcs remote [list|add <name> <url>|remove <name>]');
      }

      case 'bookmarks': {
        const bookmarks = await vcsOps.listBookmarks(ctx.workspaceId);
        if (bookmarks.length === 0) return ok('No bookmarks.');
        return ok(
          bookmarks
            .map((b) => `${b.name} -> ${b.changeId}${b.isLocal ? ' (local)' : ''}`)
            .join('\n'),
        );
      }

      default:
        return fail(`Unknown vcs action: ${action}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'VCS command failed';
    return fail(message);
  }
}

export function registerVcsCliCommands(registry: CliRegistry): void {
  registry.register({
    name: 'vcs',
    summary: 'Version control commands (status, log, diff, checkpoint, push, remote, fetch, bookmarks)',
    help:
      'vcs — Version control\n\n' +
      'Usage: sero vcs <action> [args]\n\n' +
      'Actions:\n' +
      '  status                  Show working copy status\n' +
      '  log [--limit N]         Show recent changes\n' +
      '  diff <from> [to]        Show diff between revisions\n' +
      '  checkpoint [message]    Create checkpoint\n' +
      '  push [branch]           Push commits to the remote\n' +
      '  fetch [remote]          Fetch from remote(s)\n' +
      '  remote [list]           List configured remotes\n' +
      '  remote add <name> <url> Add a remote\n' +
      '  remote remove <name>    Remove a remote\n' +
      '  bookmarks               List bookmarks\n',
    source: 'ipc',
    group: 'Version Control',
    execute: handleVcs,
  });
}
