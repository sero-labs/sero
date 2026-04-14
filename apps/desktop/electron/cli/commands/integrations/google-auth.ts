import type { CliCommandContext, CliResult } from '@electron/cli/core/types';
import { fail } from '@electron/cli/lib/utils';
import { runGog, gogResultToCliResult, GOG_AUTH_TIMEOUT_MS } from '@electron/cli/lib/gog-runner';
import { extractAccount } from './google-helpers';

export async function handleGoogleAuth(args: string[], ctx: CliCommandContext): Promise<CliResult> {
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
      const credentialsPath = cleaned[0];
      if (!credentialsPath) return fail('Usage: sero google auth credentials <path-to-credentials.json>');
      return gogResultToCliResult(
        await runGog(['auth', 'credentials', credentialsPath], ctx, { account, timeoutMs: GOG_AUTH_TIMEOUT_MS }),
      );
    }

    case 'add': {
      const email = cleaned[0];
      if (!email) return fail('Usage: sero google auth add <email>');
      return gogResultToCliResult(
        await runGog(['auth', 'add', email, ...cleaned.slice(1)], ctx, {
          account,
          timeoutMs: GOG_AUTH_TIMEOUT_MS,
          noInput: false,
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
