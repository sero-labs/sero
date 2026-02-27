/**
 * Google CLI commands — wraps gogcli (https://github.com/steipete/gogcli)
 * to give Sero agents access to Gmail, Calendar, and Google auth.
 *
 * All commands delegate to the `gog` binary running inside the workspace
 * container via `containerManager.exec()`.
 */

import { containerManager } from '../../ipc/shared-infra';
import type { CliRegistry } from '../registry';
import type { CliCommandContext, CliResult } from '../types';
import { fail, ok, parseFlags, requireFlagString } from './utils';

// ── Shell helpers ────────────────────────────────────────────

/** Single-quote a value for safe inclusion in a sh -c command string. */
function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/** Build a shell-safe command string from an array of arguments. */
function buildCommand(args: string[]): string {
  return args.map(shQuote).join(' ');
}

// ── gog execution ────────────────────────────────────────────

const GOG_TIMEOUT_MS = 30_000;
const GOG_AUTH_TIMEOUT_MS = 60_000;

interface GogResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runGog(
  gogArgs: string[],
  ctx: CliCommandContext,
  opts?: { json?: boolean; account?: string; timeoutMs?: number; noInput?: boolean },
): Promise<GogResult> {
  const parts = ['gog'];
  if (opts?.account) parts.push('--account', opts.account);
  if (opts?.json) parts.push('--json');
  if (opts?.noInput !== false) parts.push('--no-input');
  parts.push(...gogArgs);

  const command = buildCommand(parts);
  const timeout = opts?.timeoutMs ?? GOG_TIMEOUT_MS;

  return containerManager.exec(ctx.workspaceId, command, undefined, timeout);
}

function gogResultToCliResult(result: GogResult): CliResult {
  if (result.exitCode === 127) {
    return fail(
      'gogcli (gog) not found in container. Install it: brew install steipete/tap/gogcli\n' +
      'See https://github.com/steipete/gogcli for details.',
    );
  }

  const output = result.stdout.trim();
  const stderr = result.stderr.trim();

  if (result.exitCode !== 0) {
    // Surface the most useful error message
    const errorText = stderr || output || 'Command failed';
    if (errorText.includes('no authenticated accounts') || errorText.includes('not authenticated')) {
      return fail(`${errorText}\n\nHint: Run "sero google auth add <email>" to authenticate a Google account.`);
    }
    return fail(errorText);
  }

  // Combine stdout (primary) with any stderr warnings
  const parts = [output];
  if (stderr && !stderr.startsWith('{')) {
    parts.push(`\n[stderr] ${stderr}`);
  }
  return ok(parts.join(''));
}

// ── Helpers ──────────────────────────────────────────────────

/** Extract --account flag from args, returning the cleaned args and account. */
function extractAccount(args: string[]): { cleaned: string[]; account?: string } {
  const { positionals, flags } = parseFlags(args);
  const account = requireFlagString(flags, 'account') ?? undefined;

  // Rebuild args without --account (pass all other flags through)
  const cleaned: string[] = [...positionals];
  for (const [key, value] of flags) {
    if (key === 'account') continue;
    if (value === true) {
      cleaned.push(`--${key}`);
    } else {
      cleaned.push(`--${key}`, value);
    }
  }
  return { cleaned, account };
}

// ── Auth commands ────────────────────────────────────────────

async function handleAuth(args: string[], ctx: CliCommandContext): Promise<CliResult> {
  const [action, ...rest] = args;
  if (!action) {
    return fail(
      'Usage: sero google auth <action>\n\n' +
      'Actions:\n' +
      '  credentials <path>     Import OAuth client credentials JSON\n' +
      '  add <email>            Authorize a Google account\n' +
      '  remove <email>         Remove an authorized account\n' +
      '  list [--check]         List authorized accounts\n' +
      '  status                 Show auth status and services\n' +
      '  services               Show available Google services\n' +
      '  alias set <n> <email>  Set an account alias\n' +
      '  alias list             List aliases\n' +
      '  alias unset <name>     Remove an alias',
    );
  }

  const { cleaned, account } = extractAccount(rest);

  switch (action) {
    case 'credentials': {
      const path = cleaned[0];
      if (!path) return fail('Usage: sero google auth credentials <path-to-credentials.json>');
      return gogResultToCliResult(
        await runGog(['auth', 'credentials', path], ctx, { account, timeoutMs: GOG_AUTH_TIMEOUT_MS }),
      );
    }

    case 'add': {
      const email = cleaned[0];
      if (!email) return fail('Usage: sero google auth add <email>');
      // auth add may need longer timeout for OAuth flow
      return gogResultToCliResult(
        await runGog(['auth', 'add', email, ...cleaned.slice(1)], ctx, {
          account,
          timeoutMs: GOG_AUTH_TIMEOUT_MS,
          noInput: false, // auth flow may need interaction
        }),
      );
    }

    case 'remove': {
      const email = cleaned[0];
      if (!email) return fail('Usage: sero google auth remove <email>');
      return gogResultToCliResult(
        await runGog(['auth', 'remove', email, '--force'], ctx, { account, timeoutMs: GOG_AUTH_TIMEOUT_MS }),
      );
    }

    case 'list':
      return gogResultToCliResult(
        await runGog(['auth', 'list', ...cleaned], ctx, { account }),
      );

    case 'status':
      return gogResultToCliResult(
        await runGog(['auth', 'status'], ctx, { account }),
      );

    case 'services':
      return gogResultToCliResult(
        await runGog(['auth', 'services'], ctx, { account }),
      );

    case 'alias': {
      const [aliasAction, ...aliasRest] = cleaned;
      if (!aliasAction || !['set', 'list', 'unset'].includes(aliasAction)) {
        return fail('Usage: sero google auth alias <set|list|unset> [args]');
      }
      return gogResultToCliResult(
        await runGog(['auth', 'alias', aliasAction, ...aliasRest], ctx, { account }),
      );
    }

    default:
      return fail(`Unknown auth action: ${action}. Run "sero google auth" for usage.`);
  }
}

// ── Gmail commands ───────────────────────────────────────────

async function handleGmail(args: string[], ctx: CliCommandContext): Promise<CliResult> {
  const [action, ...rest] = args;
  if (!action) {
    return fail(
      'Usage: sero google gmail <action>\n\n' +
      'Actions:\n' +
      '  search \'<query>\' [--max N]  Search emails\n' +
      '  get <messageId>             Get a message\n' +
      '  thread <threadId>           Get a thread\n' +
      '  send [flags]                Send an email\n' +
      '  labels list                 List labels\n' +
      '  labels modify <threadId>    Modify thread labels\n' +
      '  drafts list                 List drafts\n' +
      '  drafts create [flags]       Create a draft\n' +
      '  drafts send <draftId>       Send a draft\n' +
      '  url <threadId>              Get web URL for thread',
    );
  }

  const { cleaned, account } = extractAccount(rest);

  switch (action) {
    case 'search': {
      const query = cleaned[0];
      if (!query) return fail('Usage: sero google gmail search \'<query>\' [--max N]');
      const gogArgs = ['gmail', 'search', query];
      // Pass through remaining flags
      for (let i = 1; i < cleaned.length; i++) gogArgs.push(cleaned[i]!);
      return gogResultToCliResult(
        await runGog(gogArgs, ctx, { json: true, account }),
      );
    }

    case 'get': {
      const messageId = cleaned[0];
      if (!messageId) return fail('Usage: sero google gmail get <messageId>');
      return gogResultToCliResult(
        await runGog(['gmail', 'get', messageId, ...cleaned.slice(1)], ctx, { json: true, account }),
      );
    }

    case 'thread': {
      const threadId = cleaned[0];
      if (!threadId) return fail('Usage: sero google gmail thread <threadId>');
      return gogResultToCliResult(
        await runGog(['gmail', 'thread', 'get', threadId, ...cleaned.slice(1)], ctx, { json: true, account }),
      );
    }

    case 'send': {
      if (cleaned.length === 0) {
        return fail(
          'Usage: sero google gmail send --to <email> --subject "<s>" --body "<b>"\n' +
          '       sero google gmail send --reply-to-message-id <id> --body "<b>" [--quote]',
        );
      }
      return gogResultToCliResult(
        await runGog(['gmail', 'send', ...cleaned], ctx, { json: true, account }),
      );
    }

    case 'labels': {
      const [labelAction, ...labelRest] = cleaned;
      if (!labelAction) return fail('Usage: sero google gmail labels <list|modify|create|delete>');

      switch (labelAction) {
        case 'list':
          return gogResultToCliResult(
            await runGog(['gmail', 'labels', 'list', ...labelRest], ctx, { json: true, account }),
          );
        case 'modify':
          if (!labelRest[0]) return fail('Usage: sero google gmail labels modify <threadId> --add <label> --remove <label>');
          return gogResultToCliResult(
            await runGog(['gmail', 'labels', 'modify', ...labelRest], ctx, { json: true, account }),
          );
        case 'create':
          if (!labelRest[0]) return fail('Usage: sero google gmail labels create "<name>"');
          return gogResultToCliResult(
            await runGog(['gmail', 'labels', 'create', ...labelRest], ctx, { json: true, account }),
          );
        case 'delete':
          if (!labelRest[0]) return fail('Usage: sero google gmail labels delete <labelId>');
          return gogResultToCliResult(
            await runGog(['gmail', 'labels', 'delete', ...labelRest], ctx, { account }),
          );
        default:
          return fail(`Unknown labels action: ${labelAction}. Use: list, modify, create, delete`);
      }
    }

    case 'drafts': {
      const [draftAction, ...draftRest] = cleaned;
      if (!draftAction) return fail('Usage: sero google gmail drafts <list|create|send>');

      switch (draftAction) {
        case 'list':
          return gogResultToCliResult(
            await runGog(['gmail', 'drafts', 'list', ...draftRest], ctx, { json: true, account }),
          );
        case 'create':
          return gogResultToCliResult(
            await runGog(['gmail', 'drafts', 'create', ...draftRest], ctx, { json: true, account }),
          );
        case 'send': {
          const draftId = draftRest[0];
          if (!draftId) return fail('Usage: sero google gmail drafts send <draftId>');
          return gogResultToCliResult(
            await runGog(['gmail', 'drafts', 'send', ...draftRest], ctx, { json: true, account }),
          );
        }
        default:
          return fail(`Unknown drafts action: ${draftAction}. Use: list, create, send`);
      }
    }

    case 'url': {
      const threadId = cleaned[0];
      if (!threadId) return fail('Usage: sero google gmail url <threadId>');
      return gogResultToCliResult(
        await runGog(['gmail', 'url', threadId], ctx, { account }),
      );
    }

    default:
      return fail(`Unknown gmail action: ${action}. Run "sero google gmail" for usage.`);
  }
}

// ── Calendar commands ────────────────────────────────────────

async function handleCalendar(args: string[], ctx: CliCommandContext): Promise<CliResult> {
  const [action, ...rest] = args;
  if (!action) {
    return fail(
      'Usage: sero google calendar <action>\n\n' +
      'Actions:\n' +
      '  calendars                       List calendars\n' +
      '  events [calId] [--today|--week] List events\n' +
      '  search "<query>" [--today]      Search events\n' +
      '  event <calId> <eventId>         Get event details\n' +
      '  create <calId> [flags]          Create an event\n' +
      '  update <calId> <eventId> [fl.]  Update an event\n' +
      '  delete <calId> <eventId>        Delete an event\n' +
      '  respond <calId> <eventId> [fl.] Respond to invitation\n' +
      '  freebusy [flags]                Check availability\n' +
      '  conflicts [flags]               Show scheduling conflicts',
    );
  }

  const { cleaned, account } = extractAccount(rest);

  switch (action) {
    case 'calendars':
      return gogResultToCliResult(
        await runGog(['calendar', 'calendars', ...cleaned], ctx, { json: true, account }),
      );

    case 'events': {
      // If first positional looks like a flag, assume default calendar
      const gogArgs = ['calendar', 'events', ...cleaned];
      return gogResultToCliResult(
        await runGog(gogArgs, ctx, { json: true, account }),
      );
    }

    case 'search': {
      const query = cleaned[0];
      if (!query) return fail('Usage: sero google calendar search "<query>" [--today|--week|--days N]');
      return gogResultToCliResult(
        await runGog(['calendar', 'search', query, ...cleaned.slice(1)], ctx, { json: true, account }),
      );
    }

    case 'event': {
      const calId = cleaned[0];
      const eventId = cleaned[1];
      if (!calId || !eventId) return fail('Usage: sero google calendar event <calendarId> <eventId>');
      return gogResultToCliResult(
        await runGog(['calendar', 'event', calId, eventId, ...cleaned.slice(2)], ctx, { json: true, account }),
      );
    }

    case 'create': {
      const calId = cleaned[0];
      if (!calId) {
        return fail(
          'Usage: sero google calendar create <calendarId> --summary "<title>" --from <time> --to <time>\n' +
          'Options: --attendees "<emails>" --location "<loc>" --description "<desc>"',
        );
      }
      return gogResultToCliResult(
        await runGog(['calendar', 'create', ...cleaned], ctx, { json: true, account }),
      );
    }

    case 'update': {
      const calId = cleaned[0];
      const eventId = cleaned[1];
      if (!calId || !eventId) return fail('Usage: sero google calendar update <calendarId> <eventId> [flags]');
      return gogResultToCliResult(
        await runGog(['calendar', 'update', ...cleaned], ctx, { json: true, account }),
      );
    }

    case 'delete': {
      const calId = cleaned[0];
      const eventId = cleaned[1];
      if (!calId || !eventId) return fail('Usage: sero google calendar delete <calendarId> <eventId>');
      return gogResultToCliResult(
        await runGog(['calendar', 'delete', calId, eventId, ...cleaned.slice(2)], ctx, { account }),
      );
    }

    case 'respond': {
      const calId = cleaned[0];
      const eventId = cleaned[1];
      if (!calId || !eventId) {
        return fail('Usage: sero google calendar respond <calendarId> <eventId> --status accepted|declined|tentative');
      }
      return gogResultToCliResult(
        await runGog(['calendar', 'respond', ...cleaned], ctx, { json: true, account }),
      );
    }

    case 'freebusy':
      return gogResultToCliResult(
        await runGog(['calendar', 'freebusy', ...cleaned], ctx, { json: true, account }),
      );

    case 'conflicts':
      return gogResultToCliResult(
        await runGog(['calendar', 'conflicts', ...cleaned], ctx, { json: true, account }),
      );

    default:
      return fail(`Unknown calendar action: ${action}. Run "sero google calendar" for usage.`);
  }
}

// ── Top-level router ─────────────────────────────────────────

async function handleGoogle(args: string[], ctx: CliCommandContext): Promise<CliResult> {
  const [service, ...rest] = args;
  if (!service) {
    return fail(
      'Usage: sero google <service> <action> [args]\n\n' +
      'Services:\n' +
      '  auth       Manage Google account authentication\n' +
      '  gmail      Search, read, send, and manage email\n' +
      '  calendar   View, create, and manage calendar events\n\n' +
      'Global flags:\n' +
      '  --account <email|alias>   Select Google account\n\n' +
      'Examples:\n' +
      '  sero google auth list\n' +
      '  sero google gmail search \'newer_than:1d\'\n' +
      '  sero google calendar events primary --today',
    );
  }

  switch (service) {
    case 'auth':
      return handleAuth(rest, ctx);
    case 'gmail':
      return handleGmail(rest, ctx);
    case 'calendar':
      return handleCalendar(rest, ctx);
    default:
      return fail(
        `Unknown Google service: ${service}. Available: auth, gmail, calendar`,
      );
  }
}

// ── Registration ─────────────────────────────────────────────

export function registerGoogleCliCommands(registry: CliRegistry): void {
  registry.register({
    name: 'google',
    summary: 'Google Workspace commands — Gmail, Calendar, auth (via gogcli)',
    help:
      'google — Google Workspace (powered by gogcli)\n\n' +
      'Usage: sero google <service> <action> [args] [--flags]\n\n' +
      'Services:\n' +
      '  auth                          Account authentication\n' +
      '    credentials <path>          Import OAuth client credentials\n' +
      '    add <email>                 Authorize a Google account\n' +
      '    remove <email>              Remove account\n' +
      '    list [--check]              List authorized accounts\n' +
      '    status                      Show auth status\n' +
      '    services                    Show available services\n' +
      '    alias set|list|unset        Manage account aliases\n\n' +
      '  gmail                         Email operations\n' +
      '    search \'<query>\' [--max N]  Search emails\n' +
      '    get <messageId>             Read a message\n' +
      '    thread <threadId>           Read a thread\n' +
      '    send [flags]                Send an email\n' +
      '    labels list|modify|create   Manage labels\n' +
      '    drafts list|create|send     Manage drafts\n' +
      '    url <threadId>              Get web URL\n\n' +
      '  calendar                      Calendar operations\n' +
      '    calendars                   List calendars\n' +
      '    events [calId] [--today]    List events\n' +
      '    search "<query>"            Search events\n' +
      '    event <calId> <eventId>     Get event details\n' +
      '    create <calId> [flags]      Create event\n' +
      '    update <calId> <eId> [fl.]  Update event\n' +
      '    delete <calId> <eventId>    Delete event\n' +
      '    respond <calId> <eId> [fl.] RSVP to invitation\n' +
      '    freebusy [flags]            Check availability\n' +
      '    conflicts [flags]           Show conflicts\n\n' +
      'Global flags:\n' +
      '  --account <email|alias>       Select Google account\n\n' +
      'Examples:\n' +
      '  sero google auth list\n' +
      '  sero google gmail search \'from:boss newer_than:1d\'\n' +
      '  sero google gmail send --to user@example.com --subject "Hi" --body "Hello"\n' +
      '  sero google calendar events primary --today\n' +
      '  sero google calendar create primary --summary "Standup" --from 9:00 --to 9:30\n',
    source: 'builtin',
    group: 'Google',
    execute: handleGoogle,
  });
}
