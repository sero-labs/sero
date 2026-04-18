/**
 * Google CLI commands — wraps gogcli (https://github.com/steipete/gogcli)
 * to give Sero agents access to Gmail, Calendar, and Google auth.
 *
 * Container workspaces: delegates to `gog` inside the container.
 * Filesystem workspaces (e.g. global): runs `gog` locally on the host
 * using Sero-managed Google OAuth tokens (GOG_KEYRING_PASSWORD).
 */

import type { CliRegistry } from '@electron/cli/core/registry';
import type { CliCommandContext, CliResult } from '@electron/cli/core/types';
import { fail } from '@electron/cli/lib/utils';
import { handleGoogleAuth } from './google-auth';
import { handleGoogleCalendar } from './google-calendar';
import { handleGoogleGmail } from './google-gmail';

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
      return handleGoogleAuth(rest, ctx);
    case 'gmail':
      return handleGoogleGmail(rest, ctx);
    case 'calendar':
      return handleGoogleCalendar(rest, ctx);
    default:
      return fail(
        `Unknown Google service: ${service}. Available: auth, gmail, calendar`,
      );
  }
}

const GOOGLE_CLI_SUMMARY = 'Google Workspace commands — Gmail, Calendar, auth (via gogcli)';
const GOOGLE_CLI_HELP =
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
  '  sero google calendar create primary --summary "Standup" --from 9:00 --to 9:30\n';

export function registerGoogleCliCommands(registry: CliRegistry): void {
  const command = {
    summary: GOOGLE_CLI_SUMMARY,
    help: GOOGLE_CLI_HELP,
    source: 'builtin' as const,
    group: 'Google',
    execute: handleGoogle,
  };

  registry.register({
    name: 'google',
    ...command,
  });

  registry.register({
    name: 'google-builtin',
    ...command,
    hidden: true,
  });
}
