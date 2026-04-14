import type { CliCommandContext, CliResult } from '@electron/cli/core/types';
import { fail } from '@electron/cli/lib/utils';
import { runGog, gogResultToCliResult } from '@electron/cli/lib/gog-runner';
import { extractAccount } from './google-helpers';

export async function handleGoogleGmail(args: string[], ctx: CliCommandContext): Promise<CliResult> {
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
      const gogArgs = ['gmail', 'search', query, ...cleaned.slice(1)];
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
