import type { CliCommandContext, CliResult } from '@electron/cli/core/types';
import { fail } from '@electron/cli/lib/utils';
import { runGog, gogResultToCliResult } from '@electron/cli/lib/gog-runner';
import { extractAccount } from './google-helpers';

export async function handleGoogleCalendar(args: string[], ctx: CliCommandContext): Promise<CliResult> {
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

    case 'events':
      return gogResultToCliResult(
        await runGog(['calendar', 'events', ...cleaned], ctx, { json: true, account }),
      );

    case 'search': {
      const query = cleaned[0];
      if (!query) return fail('Usage: sero google calendar search "<query>" [--today|--week|--days N]');
      return gogResultToCliResult(
        await runGog(['calendar', 'search', query, ...cleaned.slice(1)], ctx, { json: true, account }),
      );
    }

    case 'event': {
      const calendarId = cleaned[0];
      const eventId = cleaned[1];
      if (!calendarId || !eventId) return fail('Usage: sero google calendar event <calendarId> <eventId>');
      return gogResultToCliResult(
        await runGog(['calendar', 'event', calendarId, eventId, ...cleaned.slice(2)], ctx, { json: true, account }),
      );
    }

    case 'create': {
      const calendarId = cleaned[0];
      if (!calendarId) {
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
      const calendarId = cleaned[0];
      const eventId = cleaned[1];
      if (!calendarId || !eventId) return fail('Usage: sero google calendar update <calendarId> <eventId> [flags]');
      return gogResultToCliResult(
        await runGog(['calendar', 'update', ...cleaned], ctx, { json: true, account }),
      );
    }

    case 'delete': {
      const calendarId = cleaned[0];
      const eventId = cleaned[1];
      if (!calendarId || !eventId) return fail('Usage: sero google calendar delete <calendarId> <eventId>');
      return gogResultToCliResult(
        await runGog(['calendar', 'delete', calendarId, eventId, ...cleaned.slice(2)], ctx, { account }),
      );
    }

    case 'respond': {
      const calendarId = cleaned[0];
      const eventId = cleaned[1];
      if (!calendarId || !eventId) {
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
